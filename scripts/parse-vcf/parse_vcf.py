import argparse
from io import BytesIO
from multiprocessing.queues import JoinableQueue
from multiprocessing import JoinableQueue as MPQueue, Process
import os
from queue import Empty
import re
import subprocess
import time
from typing import (
    Iterator,
    Optional,
    TypedDict,
    NamedTuple,
    List,
    Union,
    Literal,
    cast,
)

import allel
import numpy as np
import pandas as pd


parser = argparse.ArgumentParser(description="Process a vcf")

parser.add_argument(
    "path", type=str, help="vcf path, can be a local path or remote url"
)

parser.add_argument(
    "--chunk_size",
    type=int,
    default=100000,
    help="size of chunk to be processed at a time",
)

parser.add_argument(
    "--startPosition",
    type=str,
    required=False,
    help="X:1234",
)

parser.add_argument(
    "--concurrency_max",
    type=int,
    default=2,
    help="maximum threads",
)

parser.add_argument(
    "--source",
    type=str,
    help="e.g. gnomad_2.1.1_exome",
    required=True,
)

parser.add_argument(
    "--chr",
    type=str,
    help="The target chromosome",
)

parser.add_argument(
    "--out",
    type=str,
    help="absolute path to directory where results are stored [e.g. /foo/bar]",
    required=True,
)


class JobConfig(TypedDict):
    chr: str
    chunk_size: int
    concurrency_max: int
    out: str
    path: str
    source: str
    startPosition: Optional[str]


class Annotation(TypedDict):
    aa_changes: str
    af: float
    alt: str
    cdna: int
    chr: int
    dataset_id: int
    filter: str
    gene_name: str
    gnomad_het: float
    gnomad_hom: int
    info: str
    pos: int
    qual: str
    ref: str
    transcript: str


class InsertableAnnotation(Annotation):
    assembly: Union[Literal[37], Literal[38]]
    source: str


RegionConfig = NamedTuple(
    "RegionConfig",
    [("chr", str), ("start", int), ("end", int), ("assembly", str), ("source", str)],
)


class ChromMap(TypedDict):
    assembly: str
    chrom: str
    length: int


def run(job_config: JobConfig):
    """
    loop through contigs in vcf and create queues for each and work them in sequence
    note that by-chromosome queues are mainly for ease of monitoring/debugging; they're not strictly necessary
    """
    by_chromosome_configs = build_per_chromosome_configs(job_config)
    chunk_size = job_config["chunk_size"] if "chunk_size" in job_config else 50000
    for conf in by_chromosome_configs:
        # vcf header will list every contig, even if file contains data for only one; passing in target chr prevents unneceesary queues
        if not job_config["chr"] or conf.chr.replace("chr", "") == job_config["chr"]:
            work_queue(
                conf,
                job_config["concurrency_max"],
                chunk_size,
                job_config["path"],
                job_config["out"],
            )


def get_int_val_of_chrom(chrom: str):
    try:
        return int(chrom)
    except ValueError:
        if chrom.lower() == "x":
            return 23
        if chrom.lower() == "y":
            return 24
        else:
            raise ValueError(f"Chrom {chrom} does not exist!")


def build_per_chromosome_configs(job_config: JobConfig) -> Iterator[RegionConfig]:
    """convert JobConfig into a list of RegionConfigs, one for each chromosome in the file unless otherwise specified in JobConfig"""
    header = get_header(job_config["path"])
    [start_chrom, start_pos] = (
        job_config["startPosition"].split(":")
        if job_config["startPosition"]
        else [None, None]
    )
    chroms_in_file = get_chrom_config(header.headers)
    chroms_to_process = (
        [
            chrom_map
            for chrom_map in chroms_in_file
            if get_int_val_of_chrom(chrom_map["chrom"])
            >= get_int_val_of_chrom(job_config["startPosition"])
        ]
        if start_chrom
        else chroms_in_file
    )

    return (
        RegionConfig(
            chrom["chrom"],
            start_pos if start_pos and chrom["chrom"] == start_chrom else 0,
            get_end(job_config, chrom),
            chrom["assembly"],
            job_config["source"],
        )
        for chrom in chroms_to_process
    )


def get_end(config: JobConfig, chrom: ChromMap) -> int:
    if "loc_end" not in config:
        return chrom["length"]

    else:
        return cast(int, config["loc_end"])


def get_chrom_config(headers):
    return [
        extract_chrom_info(header) for header in headers if extract_chrom_info(header)
    ]


def get_header(url: str):
    res = subprocess.run(["bcftools", "view", "-h", url], capture_output=True)
    return allel.read_vcf_headers(BytesIO(res.stdout))


def extract_chrom_info(chrom_entry: str) -> ChromMap:
    match = re.search(r"##contig=<ID=(\w+),length=(\d+),assembly=(\w+)", chrom_entry)
    if match:
        chrom, length, assembly = match.groups()
        return ChromMap(chrom=chrom, length=int(length), assembly=assembly)
    else:
        return None


def fetch_and_insert(queue: JoinableQueue, path: str, outpath: str):
    while True:
        try:
            config = queue.get(
                True, 0.01
            )  # get_noawait can leave zombie processes when Empty is raised erroneously/prematurely (typicaly due to deadlocking with local files)
            chunk = fetch_vcf_chunk(config, path)
            if chunk:
                df = parse_vcf_response(chunk)
                if df.size:
                    df["assembly"] = config.assembly
                    df["source"] = config.source
                    filename = f"{outpath}/{config.source}/{config.assembly}.csv"
                    target_path = os.path.dirname(filename)
                    os.makedirs(target_path, exist_ok=True)
                    file_exists = (
                        os.path.isfile(filename) and os.path.getsize(filename) > 0
                    )
                    if not file_exists:
                        with open(filename, "w") as f:
                            f.write(df.to_csv(index=False, header=True))
                    else:
                        with open(filename, "a") as f:
                            f.write(df.to_csv(index=False, header=False))

                print("Queue size: {size}".format(size=queue.qsize()))
            queue.task_done()

        except Empty:
            break
        except Exception as e:
            print(e)
            queue.task_done()  # keep get() and task_done() calls in sync
            queue.put_nowait(
                config
            )  # this is usually a connectivity or deadlock issue, so push back in queue

    return


def work_queue(
    region_config: RegionConfig,
    concurrency_max: int,
    chunk_size: int,
    path: str,
    outpath: str,
):
    """create queue and dispatch workers to it"""
    region_chunks = chunk_region_config(region_config, chunk_size)
    queue = MPQueue(len(region_chunks))

    [queue.put_nowait(n) for n in region_chunks]

    """ dispatch workers to chromosome's queue """
    for i in range(min(concurrency_max, len(region_chunks))):
        print(f"starting process {i}")
        p = Process(target=fetch_and_insert, args=([queue, path, outpath]), daemon=True)
        p.start()

    """ block until queue is drained """
    queue.join()
    return


def chunk_region_config(
    region_config: RegionConfig, chunk_size
) -> Iterator[RegionConfig]:
    """break region config into chunks"""
    chr = region_config.chr
    chunks = []
    for n in range(region_config.start, region_config.end, chunk_size):
        chunks.append(
            RegionConfig(
                chr, n + 1, n + chunk_size, region_config.assembly, region_config.source
            )
        )
    return chunks


def fetch_vcf_chunk(config: RegionConfig, path: str) -> List[InsertableAnnotation]:
    """query a range of a vcf, convert to DataFrame and parse"""
    print(f"fetching {config}")

    """ note that region may require "chr" prefix to first argument, depending on presence in the contig header """
    query_result = subprocess.run(
        [
            "bcftools",
            "query",
            path,
            "-H",
            "-r",
            "{0}:{1}-{2}".format(*config),
            "--exclude",
            "INFO/AF>0.02",
            "-f",
            "%CHROM\t%POS\t%REF\t%ALT\t%INFO/vep\t%INFO/nhomalt\t%INFO/AC\t%INFO/AF\n",
        ],
        capture_output=True,
        timeout=90,  # prevent process from hanging in case of connectivity issue
    )

    if query_result.stderr:
        raise Exception(f"bcftools error!: {query_result.stderr}")

    return query_result.stdout


def parse_vcf_response(vcf: bytes):
    callset_df = cast(
        pd.DataFrame,
        pd.read_csv(
            BytesIO(vcf),
            sep="\t",
            na_values=".",
            dtype={
                "# [1]CHROM": str,
                "[2]POS": int,
                "[3]REF": str,
                "[4]ALT": str,
                "[5]vep": str,
                "[6]nhomalt": int,
                "[7]AC": int,
                "[8]AF": float,
            },
        ),
    )
    """ remove bcftools' brackets from headers and convert to lower case """
    callset_df.rename(
        columns=lambda header: re.sub(r"(\[.+\])|\# | \W", "", header).lower(),
        inplace=True,
    )
    callset_df = parse_vep(callset_df)

    callset_df = callset_df.drop_duplicates()

    callset_df["af"] = callset_df["af"].fillna(0)

    return callset_df


def parse_vep(df: pd.DataFrame):
    # FYI
    VEP_HEADERS = "Allele,Consequence,IMPACT,SYMBOL,Gene,Feature_type,Feature,BIOTYPE,EXON,INTRON,HGVSc,HGVSp,cDNA_position,CDS_position,Protein_position,Amino_acids,Codons,Existing_variation,ALLELE_NUM,DISTANCE,STRAND,FLAGS,VARIANT_CLASS,MINIMISED,SYMBOL_SOURCE,HGNC_ID,CANONICAL,TSL,APPRIS,CCDS,ENSP,SWISSPROT,TREMBL,UNIPARC,GENE_PHENO,SIFT,PolyPhen,DOMAINS,HGVS_OFFSET,GMAF,AFR_MAF,AMR_MAF,EAS_MAF,EUR_MAF,SAS_MAF,AA_MAF,EA_MAF,ExAC_MAF,ExAC_Adj_MAF,ExAC_AFR_MAF,ExAC_AMR_MAF,ExAC_EAS_MAF,ExAC_FIN_MAF,ExAC_NFE_MAF,ExAC_OTH_MAF,ExAC_SAS_MAF,CLIN_SIG,SOMATIC,PHENO,PUBMED,MOTIF_NAME,MOTIF_POS,HIGH_INF_POS,MOTIF_SCORE_CHANGE,LoF,LoF_filter,LoF_flags,LoF_info\n"
    CANONICAL_INDEX = 26
    BIOTYPE_INDEX = 7
    TARGET_INDEXES = {4: "gene", 6: "transcript", 12: "cdna", 15: "amino_acids"}

    def vep_to_array(vep: str):
        rows = vep.split(",")
        target_vep_row = None
        for row in rows:
            is_canonical = False
            is_protein_coding = False
            vals = row.split("|")
            for i, val in enumerate(vals):
                if i == CANONICAL_INDEX and val == "YES":
                    is_canonical = True
                if i == BIOTYPE_INDEX and val == "protein_coding":
                    is_protein_coding = True
            if is_canonical and is_protein_coding:
                target_vep_row = row
                break
        if target_vep_row:
            all_vals = target_vep_row.split("|")
            return np.array([all_vals[i] for i in TARGET_INDEXES.keys()])
        else:
            return np.array([None for i in TARGET_INDEXES.keys()])

    def break_out_vep_and_merge(df: pd.DataFrame):
        vep_fields = df["vep"].apply(func=vep_to_array)
        vep_df = pd.DataFrame(list(vep_fields))
        renamed = vep_df.rename(
            {i: name for i, name in enumerate(TARGET_INDEXES.values())}, axis="columns"
        )
        concatenated = pd.concat([df, renamed], axis=1).drop("vep", axis=1)

        concatenated[["nhomalt", "ac", "af"]] = concatenated[
            ["nhomalt", "ac", "af"]
        ].apply(pd.to_numeric, errors="coerce")

        return concatenated

    return break_out_vep_and_merge(df)


if __name__ == "__main__":

    start = time.time()
    args = parser.parse_args()

    job_config = JobConfig(vars(args))

    run(job_config)

    end = time.time()

    duration = (end - start) / 60

    print(f"processing finished in {duration} minutes")
