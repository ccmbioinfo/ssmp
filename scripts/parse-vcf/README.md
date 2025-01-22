# bcftools image and annotation processing script

## Environment

The Dockerfile in this directory creates a bcftools image and installs some additional libraries for parsing local or remote vcf files using the `parse_vcf` python module. This parsing module is tailored to gnomAD annotation files and builds a csv comprised of the fields required by the SSMP application.

To build the image, run `docker build -t bcftools .` from the directory containing the Dockerfile.

The entrypoint is the bcftools binary, so you can run an arbitrary bcftools command in a local directory against a local file with something like:

```bash
docker run --rm -v `pwd`:`pwd` -w `pwd` bcftools stats <some-vcf-in-the-current-working-directory.bgz>
```

## Running the script

You can use the image to run the `parse_vcf` python module, which will parse a gnomAD annotation vcf and write the filtered results to a csv that can be imported into a database.

```bash
 docker run --rm -v `pwd`:`pwd` -w `pwd` --entrypoint="python" bcftools -m parse_vcf --source gnomad_2.1.1_exome --out my-local-results-directory https://gnomad-public-us-east-1.s3.amazonaws.com/release/2.1.1/vcf/genomes/gnomad.genomes.r2.1.1.sites.vcf.bgz
```

Note that even when processing remote files, you will need to have the appropriate index file (e.g. `gnomad.genomes.r2.1.1.sites.vcf.bgz.tbi`) in the directory with the script.

Though the `docker run...` approach will work, it is less than ideal given the program's current state. Because `parse_vcf` uses the python multiprocessing module to spawn child processes, these processes won't be able to print their progress/debugging messages to the host machine. It will likely be easier to run and debug the script from within the container itself, either by opening it in vscode or logging in with something like `docker run -it --rm -v `pwd`:`pwd`-w`pwd` --entrypoint="" bcftools bash`.

## What the script does

The parsing script will process a vcf of variant annotations, returning a subset of fields and combining them into a single csv, which can then be moved to a database. By filtering out unnecessary values, the size of the annotation file can be greatly reduced. Besides the `pos`, `chrom`, `alt`, and `ref` fields, the script will also return `nhomalt`, `AF`, `AC` and relevant `VEP` fields (if available). If you would like to adjust this output, the script will have to be manually updated (see `parse_vcf_response` function). There is also some data type coercion that is tailored to the configuration of the mongo database for ease of import that may need to be changed if the script is used for other purposes.

To improve efficiency, the script uses the python multiprocessing module to process chunks of the vcf file in parallel. It does this by reading the file's header and breaking each chromosome into a collection of subregions, each of which is passed into a processing queue. The script then deploys workers (the default number is 2, but this can be changed with the `--concurrency_max` argument) to the queue for parallel processing. Once the queue is exhausted, the script resumes execution, repeating the same process on the next chromosome until there are no more annotations to process. The results are written to a csv in the directory speficied by the `--out` argument. Performance will vary depending on resources, and it is usually necessary to try a variety of combinations for the `--chunk_size` and `--concurrency_max` arguments before finding an optimal configuration.

## Limitations

The `parse_vcf` module is very much a work in progress and currently has many limitations.

- If execution is interrupted, it will be difficult to restart. While passing a region to the `--start-position` argument will begin the script at a given locus, this is not guarnteed to restart the script where it left off. Because jobs are handled in parallel and, moreover, failed jobs are pushed back into the queue, care will have to be taken to determine which regions remain to be processed when examining an incomplete results file. Also, bear in mind that the script will not remove a csv file that already exists, so if you are restarting a script from scratch after an error, be sure to manually remove the results file first (or point to a new one), otherwise the results will be appended to the extant file.
- If this script is ever used for any other purpose, the architecture should be updated to take a more object-oriented approach with better error handling, logging, and state management.
- Concurrency could probably be handled in a simpler manner. Worker pools might be a better approach. Depending on whether you are working with a remote or local files, AsyncIO might also give a performance boost.
- In general, this script is better suited to working with remote files than local files. When using multiprocessing to query local files, deadlocks are frequent (at least in the current implementation) and often cause workers to lapse into a state of "uninterruptible sleep."
