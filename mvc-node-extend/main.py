import os
import json
import secrets
import time
import queue
import hashlib
import threading
from datetime import datetime
from base64 import encodebytes
from json import JSONDecodeError
from typing import BinaryIO, Optional, Literal, Union, Annotated

import plyvel
import requests
import uvicorn
from dotenv import load_dotenv
from mvclib import Transaction
from mvclib.hash import hash256
from mvclib.transaction import TransactionBytesIO
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from starlette.responses import Response


def log(*args, **kwargs):
    print(datetime.now(), *args, **kwargs, flush=True)


def merkle(hash_list):
    if len(hash_list) == 1:
        return hash_list[0]
    newHashList = []
    for i in range(0, len(hash_list) - 1, 2):
        newHashList.append(_hash_merkle_node(hash_list[i], hash_list[i + 1]))
    if len(hash_list) % 2 == 1:
        newHashList.append(_hash_merkle_node(hash_list[-1], hash_list[-1]))
    return merkle(newHashList)


def _hash_merkle_node(a, b):
    a1 = bytes.fromhex(a)[::-1]
    b1 = bytes.fromhex(b)[::-1]
    h = hashlib.sha256(hashlib.sha256(a1 + b1).digest()).digest()
    return h[::-1].hex()


# config
load_dotenv()
# api init
app = FastAPI()
security = HTTPBasic()
CONFIG_FILE = os.environ['CONFIG_FILE']
DB_LEVEL_INDEXER_PATH = os.environ['DB_LEVEL_INDEXER_PATH']
NODE_DATA_PATH = os.environ['NODE_DATA_PATH']
RPC_HOST = os.environ['RPC_HOST']
RPC_PORT = os.environ['RPC_PORT']
RPC_USER = os.environ['RPC_USER']
RPC_PASSWORD = os.environ['RPC_PASSWORD']
AUTHORIZATION = encodebytes(((RPC_USER + ':' + RPC_PASSWORD).encode())).decode().strip()
HEADERS = {
    "Content-Type": "text/plain",
    "Authorization": "Basic " + AUTHORIZATION
}
RPC_URL = f'http://{RPC_HOST}:{RPC_PORT}'
memory_queue = queue.Queue()
db_level_indexer = plyvel.DB(DB_LEVEL_INDEXER_PATH, create_if_missing=True)

if not os.path.exists(f'{NODE_DATA_PATH}/blocks'):
    print('Please config right NODE_DATA_PATH:', f'{NODE_DATA_PATH}')
    exit()


def get_blk_dat_file(blk_number: int):
    return f'{NODE_DATA_PATH}/blocks/blk{str(blk_number).zfill(5)}.dat'


def check_rpc_config():
    data = {
        'jsonrpc': "1.0",
        'id': int(time.time()),
        'method': "getsafemodeinfo",
    }
    resp = requests.post(RPC_URL, json=data, headers=HEADERS)
    try:
        log(resp.json())
    except JSONDecodeError as _:
        log('rpc config error, please set correct rpc username and password', _)
        exit()


BLOCK_DATA_0 = get_blk_dat_file(0)
MAGIC_BYTES = b''
if os.path.exists(BLOCK_DATA_0):
    with open(BLOCK_DATA_0, 'rb') as dat_f:
        MAGIC_BYTES = dat_f.read(4)
if MAGIC_BYTES.__len__() == 0:
    print('MAGIC_BYTES read error')
    exit()
check_rpc_config()


class BlockParseError(Exception):
    pass


class BlockBytesIO(TransactionBytesIO):

    def __init__(self, f: BinaryIO):
        super().__init__()
        self._handler = f

    def read(self, __size: int | None = ...):
        return self._handler.read(__size)

    def read_bytes(self, byte_length: Optional[int] = None) -> bytes:
        """
        Read and return up to size bytes.
        If the argument is omitted, None, or negative, data is read and returned until EOF is reached
        An empty bytes object is returned if the stream is already at EOF.
        """
        return self.read(byte_length)

    def read_int(self, byte_length: int, byteorder: Literal['big', 'little'] = 'little') -> int:
        """
        :returns: None if the stream is already at EOF
        """
        octets = self.read_bytes(byte_length)
        assert octets
        return int.from_bytes(octets, byteorder=byteorder)

    def read_varint(self) -> int:
        """
        :returns: None if the stream is already at EOF
        """
        octets = self.read_bytes(1)
        assert octets
        octets = ord(octets)
        if octets <= 0xfc:
            return octets
        elif octets == 0xfd:
            return self.read_int(2)
        elif octets == 0xfe:
            return self.read_int(4)
        else:
            return self.read_int(8)


class DatParse:

    def __init__(self, io: BinaryIO, seek: int):
        io.seek(seek)
        self._io = io
        self.last_magic_read_position = seek

    def read(self, num):
        return self._io.read(num)

    def check_next_magic(self):
        seek = self._io.tell()
        res = self._io.read(4)
        self._io.seek(seek)
        return res

    def read_magic(self):
        # record last magic
        self.last_magic_read_position = self._io.tell()
        for i in range(5):
            magic = self._io.read(4)
            if magic == MAGIC_BYTES:
                return magic
            else:
                self.read_size()

    def read_size(self):
        return int.from_bytes(self._io.read(4), byteorder='little')

    def read_block_header(self):
        return self._io.read(80)

    def read_txs(self, block_len):
        return self._io.read(block_len - 80)

    @property
    def position(self):
        return self.last_magic_read_position

    def tell(self):
        return self._io.tell()


class ApiThread(threading.Thread):
    def __init__(self):
        threading.Thread.__init__(self, daemon=True)

    def run(self):
        uvicorn.run(
            app,
            host='0.0.0.0',
            port=8000,
            loop='uvloop'
        )


def get_config():
    # load config on start
    if os.path.exists(CONFIG_FILE):
        cfg = json.loads(open(CONFIG_FILE).read())
    else:
        cfg = {
            'blk_number': 0,
            'position': 0
        }
    return cfg


def save_config():
    with open(CONFIG_FILE, 'w') as f:
        f.write(json.dumps(config, indent=2))


def check_block_merkle(block_header, dat_io):
    block_io = BlockBytesIO(dat_io)
    merkle_root = block_header[36:36 + 32][::-1].hex()
    tx_number = block_io.read_varint()
    txid_list = []
    while True:
        tx = Transaction.from_hex(block_io)
        if tx is None:
            raise BlockParseError(f'{tx_number}')
        else:
            tx_number -= 1
            txid_list.append(tx.txid())
        if tx_number == 0:
            break
    tx_merkle_root = merkle(txid_list)
    if merkle_root != 'da2b9eb7e8a3619734a17b55c47bdd6fd855b0afa9c7e14e3a164a279e51bba9' and tx_merkle_root != merkle_root:
        raise BlockParseError(f'merkle verify failed')


class BaseIndexer:

    def __init__(self, blk_number: int, start_index: int, size: int):
        self.blk_number = blk_number
        self.start_index = start_index
        self.size = size

    def to_bytes(self):
        a = self.blk_number.to_bytes(4, byteorder='little', signed=False)
        b = self.start_index.to_bytes(4, byteorder='little', signed=False)
        c = self.size.to_bytes(4, byteorder='little', signed=False)
        return a + b + c

    @classmethod
    def from_bytes(cls, ab: bytes):
        a = ab[:4]
        b = ab[4:8]
        c = ab[8:]
        return cls(
            int.from_bytes(a, byteorder='little', signed=False),
            int.from_bytes(b, byteorder='little', signed=False),
            int.from_bytes(c, byteorder='little', signed=False)
        )

    def __repr__(self):
        return (self.blk_number, self.start_index, self.size).__repr__()

    __str__ = __repr__


class BlockIndexer(BaseIndexer):
    pass


# api
def get_current_username(
        credentials: Annotated[HTTPBasicCredentials, Depends(security)]
):
    current_username_bytes = credentials.username.encode("utf8")
    correct_username_bytes = RPC_USER.encode("utf8")
    is_correct_username = secrets.compare_digest(
        current_username_bytes, correct_username_bytes
    )
    current_password_bytes = credentials.password.encode("utf8")
    correct_password_bytes = RPC_PASSWORD.encode("utf8")
    is_correct_password = secrets.compare_digest(
        current_password_bytes, correct_password_bytes
    )
    if not (is_correct_username and is_correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


@app.get("/obj/info")
def obj_info(username: Annotated[str, Depends(get_current_username)], q: Union[str, None] = None):
    log('username:', username)
    data = {
        'size': 0
    }
    try:
        q_bytes = bytes.fromhex(q)
    except ValueError as _:
        raise HTTPException(status_code=400, detail=str(_))
    if q:
        v = db_level_indexer.get(q_bytes)
        if v:
            info = BaseIndexer.from_bytes(v)
            data['size'] = info.size
    return data


@app.get("/obj/chunk")
def obj_chunk(username: Annotated[str, Depends(get_current_username)], q: str, chunk_index: int, chunk_size: int):
    log('username:', username)
    try:
        q_bytes = bytes.fromhex(q)
    except ValueError as _:
        raise HTTPException(status_code=400, detail=str(_))
    if q_bytes:
        v = db_level_indexer.get(q_bytes)
        if v:
            base_indexer = BaseIndexer.from_bytes(v)
            file = get_blk_dat_file(base_indexer.blk_number)
            with open(file, 'rb') as f:
                f.seek(base_indexer.start_index + chunk_index * chunk_size)
                read_size = chunk_size
                if base_indexer.start_index + chunk_index * chunk_size + chunk_size > base_indexer.size:
                    read_size = base_indexer.size - chunk_index * chunk_size
                tx_bytes = f.read(read_size)
                return Response(tx_bytes, media_type='application/x-binary')
        else:
            raise HTTPException(status_code=400, detail=f'${q} not exists')


def main():
    # api thread
    apiThread = ApiThread()
    apiThread.start()
    # main thread
    try:
        while True:
            blk_data = get_blk_dat_file(config["blk_number"])
            blk_next_data = get_blk_dat_file(config["blk_number"] + 1)
            if os.path.exists(blk_data):
                with open(blk_data, 'rb') as f:
                    dat_io = DatParse(f, config['position'])
                    while True:
                        magic = dat_io.read_magic()
                        if magic == MAGIC_BYTES:
                            # block size
                            block_data_size = dat_io.read_size()
                            # check next
                            re_read_magic = dat_io.check_next_magic()
                            if re_read_magic == MAGIC_BYTES:
                                continue
                            # block header
                            block_header_start = dat_io.tell()
                            block_index = BlockIndexer(config['blk_number'], block_header_start, block_data_size)
                            block_header = dat_io.read_block_header()
                            block_hash_bytes = hash256(block_header)[::-1]
                            with db_level_indexer.write_batch() as b:
                                b.put(block_hash_bytes, block_index.to_bytes())
                                block_hash = block_hash_bytes.hex()
                                try:
                                    check_block_merkle(block_header, dat_io)
                                except BlockParseError as e:
                                    log(f'mvc node write block not completed {block_hash}')
                                    log(e)
                                    break
                                log(block_hash, config['blk_number'], dat_io.position, block_index, config)
                        else:
                            # check next block exists, if exists position set 0
                            if os.path.exists(blk_next_data):
                                if magic:
                                    continue
                                config['blk_number'] += 1
                                config['position'] = 0
                                # config change
                                save_config()
                            else:
                                if config['position'] != dat_io.position:
                                    config['position'] = dat_io.position
                                    # config change
                                    save_config()
                                time.sleep(0.1)
                            break
    except KeyboardInterrupt as _:
        log('interrupted', _)
        pass


# instance config
config = get_config()

if __name__ == '__main__':
    """
    1. main thread listen block and save index to leveldb
    2. use merkle root verify when save block
    Todo:
        1. scan block file <blockID:blk_number:start:size> write to leveldb ok
        2. /obj/info get file size size                                     ok
        3. /obj/chunk?chunk_index=0&chunk_size=1024000 get file chunk       ok
        4. add basic auth user password same as node                        ok
        5. write js promise sdk                                             ok
        6. test different chunk size speed                                  ok
    """
    main()
