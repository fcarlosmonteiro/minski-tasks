FROM python:3.14-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# /data é o volume nomeado do Compose; criado aqui para nascer com o dono certo.
RUN useradd --create-home app && mkdir /data && chown app /data
USER app
ENV MINSKI_DB_PATH=/data/minski.db
EXPOSE 5000
CMD ["flask", "--app", "minski", "run", "--host", "0.0.0.0", "--port", "5000"]
