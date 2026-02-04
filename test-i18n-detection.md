# Correções na Detecção Automática de Idioma

## Problemas Identificados e Corrigidos

### 1. **Problema: Códigos de idioma compostos não eram reconhecidos**

**Antes:**

- A função `parseLanguageFromLocale` dividia `pt-BR` em `pt` e `BR`
- Depois procurava por uma correspondência **exata** entre `pt` e os idiomas suportados
- Como `pt-BR` é diferente de `pt`, nunca encontrava correspondência
- Resultado: usuários com `pt-BR` no navegador recebiam `en` (fallback)

**Depois:**

```typescript
const parseLanguageFromLocale = (locale: string): SupportedLanguageCodes | null => {
  // Remove quality values (e.g., "pt-BR;q=0.9" -> "pt-BR")
  const cleanLocale = locale.split(';')[0].trim();

  // First, try to find an exact match (e.g., "pt-BR")
  const exactMatch = APP_I18N_OPTIONS.supportedLangs.find(
    (lang): lang is SupportedLanguageCodes => lang === cleanLocale,
  );

  if (exactMatch) {
    return exactMatch;
  }

  // If no exact match, try to match by base language (e.g., "pt" from "pt-BR" or "pt-PT")
  const [baseLanguage] = cleanLocale.split('-');
  const baseLanguageMatch = APP_I18N_OPTIONS.supportedLangs.find(
    (lang): lang is SupportedLanguageCodes => lang === baseLanguage,
  );

  return baseLanguageMatch || null;
};
```

### 2. **Problema: Valores de qualidade (quality values) não eram removidos**

**Antes:**

- O header `Accept-Language: pt-BR;q=0.9,pt;q=0.8,en-US;q=0.7` era processado incorretamente
- A string `pt-BR;q=0.9` era comparada diretamente com os idiomas suportados

**Depois:**

- Remove os valores de qualidade antes de comparar: `pt-BR;q=0.9` → `pt-BR`
- Agora reconhece corretamente o idioma

### 3. **Problema: Apenas o primeiro idioma era verificado**

**Antes:**

```typescript
const language = parseLanguageFromLocale(headerLocales[0]);
```

- Se o primeiro idioma não fosse suportado, retornava `null`
- Não verificava os outros idiomas na lista de preferências

**Depois:**

```typescript
// Try to find the first supported language from the list
for (const locale of headerLocales) {
  const language = parseLanguageFromLocale(locale);
  if (language) {
    return {
      lang: language,
      locales: headerLocales,
    };
  }
}
```

- Agora percorre **todos** os idiomas preferidos do usuário
- Retorna o primeiro idioma suportado encontrado

### 4. **Problema: Espaços em branco não eram removidos**

**Antes:**

- Headers como `pt-BR, en-US, en` eram divididos em `["pt-BR", " en-US", " en"]`
- Os espaços causavam falhas na comparação

**Depois:**

```typescript
const headerLocales = (headers.get('accept-language') ?? '')
  .split(',')
  .map((locale) => locale.trim()); // Remove espaços em branco
```

## Exemplos de Funcionamento

### Exemplo 1: Usuário brasileiro

```
Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7
```

- ✅ Detectado: `pt-BR`
- Antes: ❌ Fallback para `en`

### Exemplo 2: Usuário português

```
Accept-Language: pt-PT,pt;q=0.9,en;q=0.8
```

- ✅ Detectado: `pt` (base language de `pt-PT`)
- Se `pt-PT` não estiver nos idiomas suportados, tenta `pt`

### Exemplo 3: Usuário francês

```
Accept-Language: fr-FR,fr;q=0.9,en;q=0.8
```

- ✅ Detectado: `fr`
- Funciona tanto para `fr-FR` quanto para `fr`

### Exemplo 4: Usuário com idioma não suportado

```
Accept-Language: ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7
```

- ❌ `ru-RU` não suportado
- ❌ `ru` não suportado
- ✅ Detectado: `en-US` ou `en` (primeiro suportado na lista)

## Benefícios

1. **Melhor experiência do usuário**: Usuários brasileiros agora veem a interface em português automaticamente
2. **Suporte robusto a códigos compostos**: `pt-BR`, `en-US`, `zh-CN`, etc. são reconhecidos corretamente
3. **Fallback inteligente**: Se `pt-BR` não estiver disponível, tenta `pt`
4. **Respeita preferências do usuário**: Percorre toda a lista de idiomas preferidos
5. **Compatível com padrões web**: Processa corretamente o header `Accept-Language` conforme RFC 2616

## Arquivos Modificados

- [packages/lib/utils/i18n.ts](packages/lib/utils/i18n.ts)
