# Eliminação de Gauss / Gaussian Elimination

Aplicação web para fazer eliminação de Gauss passo a passo, numa matriz qualquer (incluindo matrizes ampliadas), com as três operações elementares sobre linhas:

- Lᵢ ↔ Lⱼ (trocar duas linhas)
- Lᵢ ← k·Lᵢ, com k ≠ 0 (multiplicar uma linha)
- Lᵢ ← Lᵢ + k·Lⱼ, com i ≠ j (adicionar a uma linha um múltiplo de outra)

Toda a aritmética é exata (frações com inteiros de precisão arbitrária); nunca são usados números de vírgula flutuante. Interface em português e inglês. Não guarda dados.

Testes: `node tests/test.js`
