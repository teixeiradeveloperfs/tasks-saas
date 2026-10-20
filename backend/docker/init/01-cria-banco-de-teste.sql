-- O contêiner cria apenas o banco de POSTGRES_DB (flow_dev). Os testes precisam de um
-- banco separado, porque truncam todas as tabelas entre casos.
CREATE DATABASE flow_test OWNER flow;
