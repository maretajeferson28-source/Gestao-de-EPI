# Padrão visual — Gestão de EPI

Guia combinado em 10/11/2026 a partir das telas de referência. Implementado em `css/padrao.css` (só PC, acima de 720 px), tela por tela.

## Cores
| Uso | Hex |
|---|---|
| Fundo principal | `#0B0B0C` |
| Superfície (cartão) | `#141416` |
| Superfície elevada (campo, hover) | `#1A1B1F` |
| Borda | `#2A2D31` |
| Texto principal | `#F3F4F6` |
| Texto secundário | `#A1A1AA` |
| Marca / ação principal | `#FF6600` |
| Sucesso | `#22C55E` |
| Atenção | `#F59E0B` |
| Erro / vencido | `#EF4444` |

## Tipografia (Roboto)
- Título de página: 32 px, semibold
- Título de seção: 20 px, semibold
- Corpo e tabelas: 14 px, regular
- Número de indicador: 32 px, bold
- No máximo 3 tamanhos predominantes por tela.

## Espaçamento e forma
- Grade de 8 px. Padding de cartão e espaço entre blocos: 24 px. Entre campos: 16 px.
- Altura de campo, botão e linha de tabela: 44 px.
- Cantos: 12 px. Borda: 1 px `#2A2D31`. Sombra mínima ou nenhuma.

## Botões
- Primário: fundo `#FF6600`, texto branco. **Um por tela.**
- Secundário: fundo `#141416`, borda `#2A2D31`, texto `#F3F4F6`.
- Fantasma: sem fundo, texto secundário.

## Etiquetas de status
Texto e borda na cor do status, fundo levemente tingido: Em dia (verde), Atenção (amarelo), Vencido/Crítico (vermelho). Laranja só para estado ativo de navegação ou ação principal.

## Princípios
- Um único nível de cartão: nada de caixa dentro de caixa.
- Sem frases de ajuda embaixo dos títulos.
- Rótulos em texto normal (nada de CAIXA ALTA espaçada).
- Laranja usado com moderação.

## Ordem de aplicação
1. Moldura (menu lateral, barra do topo, título da página)
2. Programar entrega
3. Estoque
4. Pendências
5. Dashboard (refeito do zero)
