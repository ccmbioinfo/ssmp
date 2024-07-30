FROM python:3.9.7-buster

#htslib/bcftools deps: https://github.com/samtools/htslib/blob/develop/INSTALL
RUN apt-get update && apt-get install -y  zlib1g-dev \
    zlib1g-dev \
    libbz2-dev \
    liblzma-dev \
    libcurl4-openssl-dev \
    libssl-dev \
    vim \
    python3-pip \
    tabix

RUN pip install pandas \
    scikit-allel \
    ipykernel


RUN mkdir -p /usr/lib/htslib

WORKDIR /usr/lib/htslib

RUN wget -O htslib-1.11.tar.bz2 https://github.com/samtools/htslib/releases/download/1.11/htslib-1.11.tar.bz2 && tar -xjvf /usr/lib/htslib/htslib-1.11.tar.bz2 

RUN ./htslib-1.11/configure --enable-libcurl 

RUN cd htslib-1.11 && make && make install

WORKDIR /usr/lib

RUN wget -O bcftools-1.11.tar.bz2 https://github.com/samtools/bcftools/releases/download/1.11/bcftools-1.11.tar.bz2 && tar -xjvf /usr/lib/bcftools-1.11.tar.bz2 

RUN cd bcftools-1.11 && ./configure --with-htslib=/usr/lib/htslib/htslib-1.11 && make 

ENV PATH="/usr/lib/bcftools-1.11:${PATH}"

ENTRYPOINT ["bcftools"]
