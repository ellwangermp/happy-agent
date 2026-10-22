# -*- coding: utf-8 -*-
"""Provas da troca do .exe (casa/montar.py). Nada para nem liga o Happy Agent de verdade.

python -X utf8 casa/test_montar.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import montar as M  # noqa: E402

falhas = []


def prova(nome, cond):
    print(("ok   " if cond else "FALHA ") + nome)
    if not cond:
        falhas.append(nome)


class Relogio:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t

    def dormir(self, s):
        self.t += s


# 21/10/2026 17:22: o stop drenou mais de 120 s e a troca caiu por tempo
r = Relogio()
pedidos = []
prova("o stop que drena 5 min: a troca espera e segue",
      M.esperar_parar(lambda: pedidos.append(1), lambda: r() < 300, M.PRAZO_PARAR_S, r.dormir, r) is True
      and pedidos == [1])
r = Relogio()
prova("o programa que nunca para: a troca desiste no prazo, sem trocar",
      M.esperar_parar(lambda: None, lambda: True, M.PRAZO_PARAR_S, r.dormir, r) is False
      and r() >= M.PRAZO_PARAR_S)
prova("o prazo passa dos 120 s de antes", M.PRAZO_PARAR_S > 120)
prova("as marcas da casa entram na conferência do .exe", all(isinstance(m, bytes) and m for m in M.CASA_MARCAS))

print("TUDO CERTO" if not falhas else f"{len(falhas)} FALHA(S): {falhas}")
sys.exit(1 if falhas else 0)
