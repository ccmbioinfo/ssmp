## Sample script for integrating node.js with UCSC's liftOver command line tool

From inside this directory, run `docker build -t liftover-tools .` to build and tag the image.
Then run `docker run --rm liftover-tools liftover.js` to run the test function. If the liftovers executed successfully, you will see a message to that effect.

To move this code into the SSMP, the main Dockerfile will need to be updated to fetch and store the appropriate binaries and chain files. The javascript code will also need to be rewritten in typescript. This script might also be useful for benchmarking processing times before the decision is made to implement it in the main application. Small payloads seem relatively quick, but large payloads may slow things down. 
