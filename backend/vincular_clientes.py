"""Cria os clientes que só existem como nome nas vendas e vincula essas vendas ao cadastro.

Também roda a cada inicialização da API. Este script serve para aplicar sem reiniciar:

    cd backend && python vincular_clientes.py

Pode rodar mais de uma vez sem duplicar nada. Faça backup do banco antes da primeira execução.
Vendas com mais de um cadastro de mesmo nome continuam na aba "Sem cliente" do Financeiro.
"""
from app.core.database import engine
from app.utils.financeiro_migracao import migrar_dados_financeiros

if __name__ == "__main__":
    print(migrar_dados_financeiros(engine))
