FROM ubuntu:22.04
RUN apt-get update
RUN apt-get install build-essential libtool autotools-dev automake pkg-config libssl-dev libevent-dev bsdmainutils -y
RUN apt-get install libboost-all-dev -y
RUN apt-get install libdb-dev -y
RUN apt-get install libdb++-dev -y
RUN apt-get install libminiupnpc-dev -y
RUN apt-get install libgoogle-perftools-dev -y
RUN apt-get install libzmq3-dev -y
RUN apt-get install curl -y
RUN apt-get install gcc-9 g++-9 -y
ENV CXX g++-9
ENV NODE_VERSION 0.1.4.0
RUN curl "https://codeload.github.com/mvc-labs/microvisionchain/tar.gz/refs/tags/v${NODE_VERSION}" -o output.tar.gz
RUN tar zxvf output.tar.gz
RUN cd "microvisionchain-${NODE_VERSION}" && ./autogen.sh && ./configure && make && make install
WORKDIR /root
CMD mvcd -conf=/root/.mvc/mvc.conf
