#!/usr/bin/env python3
"""
Script de verificação do Order Flow System
Verifica se todas as dependências e configurações estão corretas
"""

import os
import sys
import subprocess
from pathlib import Path

def check_python():
    """Verifica versão do Python"""
    print("🔍 Verificando Python...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 10:
        print(f"✅ Python {version.major}.{version.minor} encontrado")
        return True
    else:
        print(f"❌ Python 3.10+ necessário (encontrado {version.major}.{version.minor})")
        return False

def check_nodejs():
    """Verifica versão do Node.js"""
    print("🔍 Verificando Node.js...")
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True)
        print(f"✅ {result.stdout.strip()} encontrado")
        return True
    except FileNotFoundError:
        print("❌ Node.js não encontrado")
        return False

def check_postgresql():
    """Verifica se PostgreSQL está acessível"""
    print("🔍 Verificando PostgreSQL...")
    try:
        result = subprocess.run(['psql', '--version'], capture_output=True, text=True)
        print(f"✅ {result.stdout.strip()} encontrado")
        return True
    except FileNotFoundError:
        print("❌ PostgreSQL não encontrado. Instale em https://www.postgresql.org/")
        return False

def check_backend_structure():
    """Verifica estrutura do backend"""
    print("🔍 Verificando estrutura do backend...")
    backend_path = Path("backend")
    required_files = [
        "main.py",
        "requirements.txt",
        ".env.example",
        "app/main.py",
        "app/core/database.py",
        "app/models",
        "app/routes",
    ]
    
    all_exist = True
    for file in required_files:
        path = backend_path / file
        if path.exists():
            print(f"  ✅ {file}")
        else:
            print(f"  ❌ {file} não encontrado")
            all_exist = False
    
    return all_exist

def check_frontend_structure():
    """Verifica estrutura do frontend"""
    print("🔍 Verificando estrutura do frontend...")
    frontend_path = Path("src/orderflow")
    required_dirs = [
        "pages",
        "components",
        "services",
        "contexts",
        "hooks",
        "types",
        "utils",
    ]
    
    all_exist = True
    for dir_name in required_dirs:
        path = frontend_path / dir_name
        if path.exists():
            print(f"  ✅ {dir_name}/")
        else:
            print(f"  ❌ {dir_name}/ não encontrado")
            all_exist = False
    
    return all_exist

def check_env_files():
    """Verifica arquivos de configuração"""
    print("🔍 Verificando arquivos de configuração...")
    
    files_to_check = [
        ("backend/.env.example", "Backend ENV"),
        ("src/orderflow/.env.example", "Frontend ENV"),
    ]
    
    all_exist = True
    for file, label in files_to_check:
        if Path(file).exists():
            print(f"  ✅ {label}")
        else:
            print(f"  ❌ {label} não encontrado")
            all_exist = False
    
    return all_exist

def main():
    print("\n" + "="*50)
    print("  ORDER FLOW - VERIFICAÇÃO DO SISTEMA")
    print("="*50 + "\n")
    
    checks = [
        ("Python 3.10+", check_python()),
        ("Node.js 18+", check_nodejs()),
        ("PostgreSQL", check_postgresql()),
        ("Backend", check_backend_structure()),
        ("Frontend", check_frontend_structure()),
        ("Configurações", check_env_files()),
    ]
    
    print("\n" + "="*50)
    print("RESUMO:")
    print("="*50)
    
    passed = sum(1 for _, result in checks if result)
    total = len(checks)
    
    for check_name, result in checks:
        status = "✅" if result else "❌"
        print(f"{status} {check_name}")
    
    print("="*50)
    print(f"\nResultado: {passed}/{total} verificações passaram")
    
    if passed == total:
        print("\n✅ SISTEMA PRONTO PARA USO!")
        print("\nPróximos passos:")
        print("1. Configure .env em backend/")
        print("2. Execute: cd backend && python main.py")
        print("3. Em outro terminal: npm run dev")
        print("4. Acesse: http://localhost:5173")
        return 0
    else:
        print("\n❌ Algumas verificações falharam")
        print("Consulte DATABASE_SETUP.md para ajuda")
        return 1

if __name__ == "__main__":
    sys.exit(main())
