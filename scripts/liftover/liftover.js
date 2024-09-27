#!/usr/bin/env node

'use strict'

/**
 simple script demonstrating 2 ways of calling the liftOver executable within node
 returns void if both functions pass validation, otherwise throws and rejected promises are not handled
 */

const testVariants = require("./sample-variants-37-ENSG157193.json")
const promiseExec = require('util').promisify(require('child_process').exec);
const tmpdir = require('os').tmpdir
const fs = require('fs/promises');
const path = require('path');

/* push a deliberately bad coordinate into test data */
const unliftable = { ...testVariants[0] };
unliftable.chromosome = 99;
unliftable.position = 1234;
testVariants.push(unliftable);

/* 
    values of test positions (in original order) from ucsc online liftover tool, used to validate results
    null value added at end of array to account for unliftable variant added to test set
*/
const verfifiedNewPositions = [53246958, 53246958, 53249403, 53249548, 53250719, 53257281, 53257422, 53262123, 53262473, 53262508, 53262508, 53262508, 53264196, 53264196, 53264236, 53266475, 53266475, 53266569, 53266614, 53266617, 53271060, 53271243, 53271287, 53272602, 53272602, 53272639, 53272639, 53274695, 53274695, 53275747, 53276692, 53276797, 53276923, 53276956, 53276968, 53276968, 53276968, 53280648, 53280648, 53280698, 53289588, 53289615, 53326882, 53327000, 53327000, 53327253, 53327786, 53327836, 53327836, 53327836, 53327838, 53327838, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327839, 53327841, 53327841, 53327854, 53327890, 53327891, null];

/* convert to bedlike format and pass as arg (for now) */
const bedstring = testVariants.map(v => `chr${v.chromosome}\t${v.position}\t${v.position}`).join("\n");

const parseBed = bed => bed.split("\n").filter(l => !!l && !l.startsWith("#")).map(v => v.split("\t")[2])

const mergeResults = (lifted, unlifted) => {

    const unliftedVariants = [];

    const unliftedMap = unlifted.reduce((acc, curr) => ({ ...acc, [curr]: true }), {});

    return testVariants.filter(v => {
        if (unliftedMap[v.position]) {
            unliftedVariants.push(v);
            return false;
        } else {
            return true;
        }
    }).map((v, i) => ({ ...v, position: +lifted[i] })).concat(unliftedVariants)
}

const createTmpFile = async () => {
    const filename = Math.random().toString(36).slice(2);
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'liftover-'));
    return path.join(dir, filename);
};

/* in this approach, node handles all file manipulation */
const runJs = async (assembly = 37) => {
    const lifted = await createTmpFile();
    const unlifted = await createTmpFile();
    const bedfile = await createTmpFile();
    await fs.writeFile(bedfile, bedstring)
    let chain;
    if (assembly === 37) {
        chain = "/home/node/chains/hg19ToHg38.over.chain";
    } else if (assembly === 38) {
        chain = "/home/node/chains/hg38ToHg19.over.chain";
    } else throw "INVALID ASSEMBLY!";

    try {
        await promiseExec(`liftOver ${bedfile} ${chain} ${lifted} ${unlifted}`)
        const _liftedVars = await fs.readFile(lifted);
        const _unliftedVars = await fs.readFile(unlifted);
        const liftedVars = parseBed(_liftedVars.toString())
        const unliftedVars = parseBed(_unliftedVars.toString())
        return mergeResults(liftedVars, unliftedVars)
    } finally {
        fs.rm(lifted)
        fs.rm(unlifted)
        fs.rm(bedfile)
    }

}

/* this implementation relies on shell wrapper of liftover script */
const run = () => promiseExec(`./run-liftover.sh -c 37 -t 38 "${bedstring}"`).then(({ stdout, stderr }) => {
    if (stderr) {
        throw stderr;
    }

    const [lifted, unlifted] = stdout.trim().split("|").map(group => group.split("\n").filter(Boolean));

    return mergeResults(lifted, unlifted);

});

const validateResults = results => {
    if (results.length !== testVariants.length) {
        throw "LENGTH MISMATCH!"
    }

    const unchanged = results.filter((v, i) => v.position !== verfifiedNewPositions[i]);

    if (unchanged.length !== 1) {
        throw "COUNT OF VARIANTS NOT IN VERIFIED SET SHOULD BE 1!";
    }
}

/* call each liftover function */

console.log("running liftover tests")

runJs().then(results => validateResults(results));
run().then(results => validateResults(results));

console.log("all tests passed")
