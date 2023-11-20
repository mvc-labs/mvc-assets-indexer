
# mvc-node-extend

* [x] parse block bin from blk*.dat 
* [x] parse tx bin from blk*.dat
* [x] listen mempool tx from node zmq
* [x] provide api download large block

## Installation

```bash
pip install -r requirements.txt
```

## Running the app

```bash
python3 main.py
```

## Use leveldb for index, blk*.dat file for save raw data
* [x] use leveldb save block bin position 
* [x] use leveldb save tx bin position
* [x] use leveldb save outpoint bin position
