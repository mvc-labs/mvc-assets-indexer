FROM node:19

ENV TIME_ZONE=Asia/Shanghai
ENV TZ=Asia/Shanghai
ENV NODE_OPTIONS="--max-old-space-size=2048"
WORKDIR /app

COPY ./package.json /app/package.json
COPY ./package-lock.json /app/package-lock.json
COPY ./tsconfig.json /app/tsconfig.json
COPY ./tsconfig.build.json /app/tsconfig.build.json

RUN npm install

RUN npm rebuild

COPY . /app/

RUN npm run build

CMD npm run start:prod
