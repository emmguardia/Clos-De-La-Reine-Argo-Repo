FROM nginx:alpine

# Fix CVE-2026-24515 (libexpat) and other security updates
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*

COPY dist/ /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

