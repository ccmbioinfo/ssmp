FROM node:latest
WORKDIR /usr/app
RUN wget -O /usr/local/bin/liftOver https://hgdownload.cse.ucsc.edu/admin/exe/linux.x86_64/liftOver  \
    && chmod +x /usr/local/bin/liftOver

WORKDIR /home/node

RUN mkdir chains && \
    wget -O ./chains/hg19ToHg38.over.chain.gz https://hgdownload.cse.ucsc.edu/goldenpath/hg19/liftOver/hg19ToHg38.over.chain.gz && \
    wget -O ./chains/hg38ToHg19.over.chain.gz https://hgdownload.cse.ucsc.edu/goldenpath/hg38/liftOver/hg38ToHg19.over.chain.gz && \
    gunzip ./chains/hg38ToHg19.over.chain.gz && \
    gunzip ./chains/hg19ToHg38.over.chain.gz

WORKDIR /usr/app

COPY . .

RUN chown -R node:node ./ && chown -R node:node /home/node
