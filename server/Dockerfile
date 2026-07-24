FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libreoffice poppler-utils ttf-dejavu

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
