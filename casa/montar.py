# -*- coding: utf-8 -*-
"""MONTAR O HAPPY AGENT DA CASA: o .exe sai deste fork, no notebook, sem Visual Studio.

Desde 17/10/2026 a caixa de areia do Windows também sai daqui (função caixa: o happy.patch com o conserto da casa).
E os arquivos que a casa muda nos pacotes vão por cima da cópia do npm que o .exe usa (CASA_JS e por_cima); o .exe
pronto tem de trazer a marca de cada um, senão a montagem para.

Quem usa: ele, que conversa com os bots no Happy do notebook, e toda sessão que muda o Happy Agent por dentro
(DECISOES.md, 17/10/2026: "mas forkar nos permitiria customizar ele né?" e "faz 1" ao fork).

O jeito da empresa compila 4 peças nativas (Rust e C++) numa máquina do GitHub. O notebook não tem esses
compiladores. As 4 peças vêm, então, de dentro do .exe OFICIAL da mesma versão: elas não mudam com o nosso código.
Prova da extração (17/10/2026): as 2 peças que o programa oficial também deixa soltas no disco
(%LOCALAPPDATA%/HappyAgentRuntime/binary-assets) saíram com o mesmo SHA-256.

    python -X utf8 casa/montar.py <happy-agent.exe oficial>            # monta dist/bin/happy-agent-win32-x64.exe
    python -X utf8 casa/montar.py <oficial> --trocar <exe em uso>        # e troca o programa que roda os bots

A troca para o programa em uso (stop), troca o arquivo por renomear (milissegundos: o religar não pega o meio) e
liga de novo com o mesmo comando do religar. O antigo vai para C:/2nd-Brain/arquivo. Depois da troca, o teste de
tela do 2nd-brain (python -X utf8 -m ferramentas.e2e_happy) tem de passar antes de dizer pronto.
"""
from __future__ import annotations

import hashlib
import os
import re
import shutil
import struct
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
AGENTE = RAIZ / "packages" / "happy-agent"
NATIVOS = AGENTE / "native" / "target" / "win32-x64"
SAIDA = AGENTE / "dist" / "bin" / "happy-agent-win32-x64.exe"
ARQUIVO = Path(r"C:\2nd-Brain\arquivo")
CODEX = Path(r"C:\2nd-Brain\happy-agent-teste\codex-src")
SEM_JANELA = 0x08000000   # CREATE_NO_WINDOW: nada pisca na tela dele

# O .exe não usa o código dos pacotes deste fork: usa a cópia do npm da mesma versão (node_modules/.pnpm). Cada arquivo
# que a casa muda num pacote vai por cima da cópia do npm, e o .exe pronto tem de trazer a marca dele (17/10/2026: o
# conserto dos acentos passou nas provas do pacote e não chegou ao .exe).
CASA_JS = [
    ("happy-agent-compute", "dist/processes/impl/shellCommandArgs.js", b"Get-Content:Encoding"),
    ("happy-agent-compute", "dist/sandbox/impl/createToolEnvironment.js", b"HAPPY_CASA_GIT_TRUST"),
]

# Cada peça: onde mora no fork e como reconhecê-la por dentro (o nome não viaja dentro do .exe).
PECAS = {
    "libsql": {"destino": [NATIVOS / "libsql.node"], "dll": True, "tem": [b"libsql", b"napi_register_module_v"]},
    "monty": {"destino": [NATIVOS / "monty.exe"], "dll": False, "tem": [b"monty-runtime"]},
    "fff": {"destino": [NATIVOS / "fff_c.dll"], "dll": True, "tem": [b"fff_create_instance"]},
    "watcher": {"destino": ["watcher"], "dll": True, "tem": [b"ReadDirectoryChangesW", b"WatcherError"]},
}


def programas_embutidos(b: bytes):
    """Cada programa do Windows (PE) dentro do .exe: (início, tamanho, é_dll). O tamanho sai da tabela de seções."""
    for m in re.finditer(rb"MZ", b):
        i = m.start()
        if i == 0:
            continue
        try:
            lf = struct.unpack_from("<I", b, i + 0x3C)[0]
            if lf > 4096 or b[i + lf:i + lf + 4] != b"PE\0\0":
                continue
            coff = i + lf + 4
            nsec, optsz, carac = (struct.unpack_from("<H", b, coff + k)[0] for k in (2, 16, 18))
            opt = coff + 20
            dd = opt + (96 if struct.unpack_from("<H", b, opt)[0] == 0x10B else 112)
            fim = max(sum(struct.unpack_from("<II", b, opt + optsz + 40 * s + 16)) for s in range(nsec))
            certo, certt = struct.unpack_from("<II", b, dd + 32)
            if certo and certt:
                fim = max(fim, certo + certt)
            if fim > 100_000 and i + fim <= len(b):
                yield i, fim, bool(carac & 0x2000)
        except (struct.error, ValueError):
            continue


def extrair(oficial: Path) -> dict[str, bytes]:
    b = oficial.read_bytes()
    achou: dict[str, bytes] = {}
    for i, tam, dll in programas_embutidos(b):
        if tam > 60_000_000:
            continue
        d = b[i:i + tam]
        for nome, p in PECAS.items():
            if nome not in achou and p["dll"] == dll and all(t in d for t in p["tem"]):
                achou[nome] = d
    falta = sorted(set(PECAS) - set(achou))
    if falta:
        raise SystemExit(f"não achei dentro de {oficial}: {falta}")
    return achou


def pasta_do_watcher() -> Path:
    base = RAIZ / "node_modules" / ".pnpm"
    pastas = sorted(base.glob("@parcel+watcher@2.6.0_patch_*/node_modules/@parcel/watcher"))
    if not pastas:
        raise SystemExit("o @parcel/watcher remendado não está instalado (rode o pnpm install primeiro)")
    return pastas[0]


def rodar(cmd: list[str], env: dict | None = None):
    print("$", " ".join(cmd))
    r = subprocess.run(cmd, cwd=RAIZ, env={**os.environ, **(env or {})}, creationflags=SEM_JANELA, shell=True)
    if r.returncode:
        raise SystemExit(f"falhou ({r.returncode}): {' '.join(cmd)}")


def caixa():
    """A caixa de areia do Windows (os 3 programas do supervisor) sai do happy.patch DESTE fork, não do npm.

    O código é o do Codex (openai/codex, commit em native/windows/source.json) com o happy.patch por cima, compilado
    pelo script da empresa (build-native-windows.mjs) com as MESMAS ferramentas da máquina da empresa: o Rust 1.95 gnu
    (scoop rustup-gnu) e o gcc do MSYS2 MINGW64 (scoop msys2 + pacman mingw-w64-x86_64-gcc). A cópia do Codex mora em
    C:/2nd-Brain/happy-agent-teste/codex-src (caminho curto: o Windows barra nome longo)."""
    cargo = Path.home() / "scoop" / "apps" / "rustup-gnu" / "current" / ".cargo" / "bin"
    mingw = Path.home() / "scoop" / "apps" / "msys2" / "current" / "mingw64" / "bin"
    if not (cargo / "cargo.exe").exists() or not (mingw / "gcc.exe").exists():
        raise SystemExit("falta o Rust ou o gcc: scoop install rustup-gnu msys2; "
                         "rustup toolchain install 1.95.0-x86_64-pc-windows-gnu --profile minimal; "
                         "no MSYS2: pacman -Sy --needed mingw-w64-x86_64-gcc")
    caminho = os.pathsep.join([str(cargo), str(mingw), os.environ["PATH"]])
    rodar(["node", "packages/happy-agent-supervisor/scripts/build-native-windows.mjs"],
          {"PATH": caminho, "HAPPY_CODEX_SOURCE_DIR": str(CODEX)})
    feitos = AGENTE.parent / "happy-agent-supervisor" / "native" / "target" / "release"
    pacotes = sorted((RAIZ / "node_modules" / ".pnpm").glob(
        "@slopus+happy-agent-supervisor@*-win32-x64/node_modules/@slopus/happy-agent-supervisor/vendor/x86_64-pc-windows-gnu/bin"))
    if len(pacotes) != 1:
        raise SystemExit(f"esperava 1 pacote do supervisor do Windows, achei {len(pacotes)}")
    for nome in ("happy-agent-supervisor.exe", "happy-sandbox-runner.exe", "happy-sandbox-setup.exe"):
        # O arquivo do pnpm é um elo (hardlink) com a loja global: troca por renomear, nunca escreve por cima.
        temp = pacotes[0] / (nome + ".casa")
        shutil.copy2(feitos / nome, temp)
        os.replace(temp, pacotes[0] / nome)
        print(f"caixa {nome}: sha256 {hashlib.sha256((pacotes[0] / nome).read_bytes()).hexdigest()[:16]}")


def por_cima():
    """Os arquivos da casa (CASA_JS) vão por cima da cópia do npm que o .exe usa."""
    for pacote, arquivo, marca in CASA_JS:
        feito = RAIZ / "packages" / pacote / arquivo
        if marca not in feito.read_bytes():
            raise SystemExit(f"{feito} não tem a marca {marca!r}: o pnpm build não rodou?")
        copias = sorted((RAIZ / "node_modules" / ".pnpm").glob(f"@slopus+{pacote}@*/node_modules/@slopus/{pacote}"))
        if not copias:
            raise SystemExit(f"não achei a cópia do npm de {pacote}")
        for copia in copias:
            temp = copia / (arquivo + ".casa")
            shutil.copy2(feito, temp)
            os.replace(temp, copia / arquivo)   # elo com a loja do pnpm: renomear, nunca escrever por cima
            print(f"por cima: {copia.parent.parent.parent.name}/{arquivo}")


def conferir_marcas(exe: Path):
    dado = exe.read_bytes()
    falta = [f"{p}/{a}" for p, a, marca in CASA_JS if marca not in dado]
    if falta:
        raise SystemExit(f"o .exe montado não traz a mudança da casa em: {falta}")


def conferir_fim_de_linha():
    """O código vai ao .exe com os bytes do upstream (LF). O git do Windows troca LF por CRLF ao copiar para a pasta
    (core.autocrlf=true do Git for Windows), e o texto fixo do programa saía com bytes a mais: o pedido ao revisor de
    permissões tinha 14000 caracteres em vez de 13889 (20/10/2026). Esta cópia tem core.autocrlf=false; se um arquivo
    voltar a CRLF, a montagem para."""
    r = subprocess.run(["git", "-C", str(RAIZ), "ls-files", "--eol", "-z"], capture_output=True,
                       creationflags=SEM_JANELA)
    trocados = [linha.split("\t", 1)[1] for linha in r.stdout.decode("utf-8").split("\0")
                if linha.startswith("i/lf") and "w/crlf" in linha.split("\t", 1)[0]]
    if r.returncode != 0 or trocados:
        raise SystemExit(f"{len(trocados)} arquivos de código estão com CRLF na pasta (o primeiro: "
                         f"{trocados[:1]}); rode git config core.autocrlf false nesta cópia e reescreva-os em LF")


def montar(oficial: Path) -> Path:
    conferir_fim_de_linha()
    versao = subprocess.run([str(oficial), "--version"], capture_output=True, text=True,
                            creationflags=SEM_JANELA).stdout.strip().split()[-1]
    pecas = extrair(oficial)
    # O install do watcher compila C++ (Visual Studio), que o notebook não tem: instala sem os scripts e põe a peça.
    rodar(["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"])
    watcher = pasta_do_watcher()
    PECAS["watcher"]["destino"] = [watcher / "build" / "Release" / "watcher.node",
                                   watcher / "build" / "win32-x64" / "watcher.node"]
    for nome, d in pecas.items():
        for destino in PECAS[nome]["destino"]:
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_bytes(d)
        print(f"peça {nome}: {len(d)} bytes, sha256 {hashlib.sha256(d).hexdigest()[:16]}")
    caixa()
    rodar(["pnpm", "build"])
    por_cima()
    rodar(["pnpm", "--filter", "@slopus/happy-agent", "build:bun", "--target", "win32-x64"],
          {"HAPPY_AGENT_RELEASE_VERSION": versao})
    conferir_marcas(SAIDA)
    print(f"montado: {SAIDA} ({hashlib.sha256(SAIDA.read_bytes()).hexdigest()[:16]}), versão {versao}")
    return SAIDA


def _vivo(exe: Path) -> bool:
    r = subprocess.run([str(exe), "status"], capture_output=True, text=True, creationflags=SEM_JANELA)
    return "not running" not in (r.stdout + r.stderr).lower()


def trocar(novo: Path, em_uso: Path):
    """Para o programa em uso, troca o arquivo por renomear e liga de novo como o religar liga."""
    sys.path.insert(0, r"C:\VS_Projects\2nd-brain")
    from ferramentas import religar
    assert Path(religar.HAPPY_AGENTE) == em_uso, f"o religar liga {religar.HAPPY_AGENTE}, não {em_uso}"
    preparado = em_uso.with_name(em_uso.stem + ".novo.exe")
    shutil.copy2(novo, preparado)
    guarda = ARQUIVO / f"happy-agent-antes-{datetime.now():%Y-%m-%d-%H%M}"
    guarda.mkdir(parents=True, exist_ok=True)
    subprocess.run([str(em_uso), "stop"], creationflags=SEM_JANELA, timeout=120)
    for _ in range(30):
        if not religar.happy_agente_ok()[0]:
            break
        time.sleep(1)
    else:
        raise SystemExit("o programa em uso não parou em 30 s; nada foi trocado")
    shutil.move(str(em_uso), str(guarda / em_uso.name))
    os.replace(preparado, em_uso)
    print(religar.religar_happy_agente())
    print(f"o antigo está em {guarda}; agora rode o teste de tela: python -X utf8 -m ferramentas.e2e_happy")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        raise SystemExit(__doc__)
    exe = montar(Path(a[0]))
    if "--trocar" in a:
        trocar(exe, Path(a[a.index("--trocar") + 1]))
