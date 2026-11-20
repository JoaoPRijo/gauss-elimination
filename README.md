# Álgebra Linear / Linear Algebra

Aplicação web para os alunos aprenderem e praticarem álgebra linear. Tópicos:

- **Eliminação de Gauss** (descrita abaixo)
- **Matrizes em escada**: definições e exemplos de escada de linhas e escada de linhas reduzida, e um modo de prática com cartões gerados ao acaso (a resposta de cada cartão é verificada pelo programa).

## Eliminação de Gauss

Aplicação web para fazer eliminação de Gauss passo a passo, numa matriz qualquer (incluindo matrizes ampliadas), com as três operações elementares sobre linhas:

- Lᵢ ↔ Lⱼ (trocar duas linhas)
- Lᵢ ← k·Lᵢ, com k ≠ 0 (multiplicar uma linha)
- Lᵢ ← Lᵢ + k·Lⱼ, com i ≠ j (adicionar a uma linha um múltiplo de outra)

Toda a aritmética é exata (frações com inteiros de precisão arbitrária); nunca são usados números de vírgula flutuante. Interface em português e inglês. Não guarda dados.

Testes: `node tests/test.js`
