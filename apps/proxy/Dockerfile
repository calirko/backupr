FROM nginx:alpine

RUN apk add --no-cache curl

COPY apps/proxy/nginx.conf /etc/nginx/nginx.conf
COPY apps/proxy/conf.d/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
