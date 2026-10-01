# Mobile e PWA

O layout exclusivo para telefone usa `css/mobile.css` apenas até 720px. Acima desse limite, os estilos existentes continuam ativos. `js/mobile.js` encaminha a navegação aos botões originais, sem duplicar consultas, gravações ou permissões administrativas.

## Instalação

- Android/Chrome: abrir o site HTTPS e tocar em **Instalar aplicativo** no menu ou na tela de login. Se o navegador ainda não oferecer a instalação, usar seu menu → Instalar aplicativo / Adicionar à tela inicial.
- iPhone/Safari: Compartilhar → Adicionar à Tela de Início → Adicionar.
- A versão instalada mantém o login normal do sistema. Instalar não concede novas permissões.

## Conexão e atualizações

Consultas e gravações precisam de internet. O service worker NÃO armazena dados do banco, sessões, fotos de colaboradores, notas fiscais, PDFs ou respostas autenticadas. O cache contém somente a tela de contingência e os ícones públicos. Isso não altera a persistência de sessão já existente no app.

HTML, JavaScript e CSS do app continuam vindo da rede, evitando versões antigas do app presas no cache do PWA. Sem conexão na abertura, há uma tela clara com **Tentar novamente**; não existe fila de gravações offline.

## Verificação

Executar `node --test scripts/test-mobile-pwa.mjs`. Na interface, conferir 320, 390, 430 e 720px e comparar desktop com 1024 e 1440px. Verificar usuário comum e administrador, abertura/fechamento do menu, filtros, histórico, formulários, consulta C.A., notas e modais. No DANFE, usar +/− e arrastar com o dedo após ampliar.

Instalação final, câmera/seletor de arquivo e teclado precisam também de uma conferência em Android e iPhone reais, pois emulação de viewport não reproduz todos os recursos do sistema operacional.
