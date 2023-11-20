FROM python:3.11.4-alpine3.18
RUN apk add git cmake make gcc g++ curl mesa-gl mesa-dev sqlite-dev gnutls-dev freetype-dev
RUN curl https://codeload.github.com/google/leveldb/tar.gz/refs/tags/1.22 -o output.tar.gz
RUN tar zxvf output.tar.gz && cd leveldb-1.22 && mkdir build && cd build && cmake -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=ON -DLEVELDB_BUILD_BENCHMARKS=OFF .. && make install
WORKDIR /app
COPY requirements.txt /app/
RUN pip install -r /app/requirements.txt
COPY main.py /app/
CMD python3 main.py
