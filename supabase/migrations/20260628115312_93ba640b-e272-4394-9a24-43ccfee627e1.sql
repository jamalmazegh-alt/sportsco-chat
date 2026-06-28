-- =====================================================================
-- Legal documents — Portuguese (pt, pt-PT) translations  [DRAFT]
-- =====================================================================

-- 1) legal_notice v2 pt
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('legal_notice', 2, 'pt', false, 'Aviso legal',
$body$> **RASCUNHO — NÃO REVISTO JURIDICAMENTE.** Tradução assistida por máquina, revisão jurídica pendente.

# Clubero — Aviso legal

_Última atualização: 28 de junho de 2026_

## Editor

**Clubero OÜ** — sociedade por quotas de direito estónio (Osaühing / OÜ).

- Denominação: Clubero OÜ
- Número de registo (registrikood): **17538695**
- Sede social: Sepapaja tn 6, 15551 Tallinn, Estónia
- Data de constituição: 25 de junho de 2026
- IVA: **Sem IVA faturado** — a Clubero OÜ não se encontra atualmente registada para efeitos de IVA.
- Atividade: empresa de software — plataforma SaaS para clubes desportivos (NACE 58.29)
- Contacto: **hello@clubero.app**
- Sítio web: <https://clubero.app>

Toda a correspondência (jurídica, proteção de dados, segurança, abuso) é tratada através de **hello@clubero.app**.

## Responsável pela publicação

O responsável pela publicação é o representante legal da Clubero OÜ.

## Alojamento e infraestrutura

- **Cloudflare, Inc.** — 101 Townsend Street, San Francisco, CA 94107, EUA — alojamento da aplicação (Workers / runtime edge).
- **Supabase** (Supabase Inc.) — região UE — base de dados, autenticação e armazenamento.
- **Lovable** (Lovable AB) — plataforma de desenvolvimento e alojamento, bem como gateway de IA para a disponibilização das funcionalidades de inteligência artificial.

## Propriedade intelectual

O Serviço, o seu código-fonte, o seu design e a sua identidade de marca (incluindo o nome e o logótipo «Clubero») são propriedade exclusiva da Clubero OÜ. É proibida qualquer reprodução, representação ou reutilização sem autorização prévia por escrito.

## Comunicação de abusos e remoção de conteúdos

As comunicações de conteúdos ilícitos ou abusivos podem ser enviadas para **hello@clubero.app**. Indique uma descrição do conteúdo, o URL e o motivo da comunicação.

## Resolução de litígios

Para litígios de consumo, a plataforma de Resolução de Litígios em Linha da Comissão Europeia está disponível em <https://ec.europa.eu/consumers/odr>.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 2) terms v4 pt
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('terms', 4, 'pt', true, 'Condições gerais de utilização da Clubero',
$body$> **RASCUNHO — NÃO REVISTO JURIDICAMENTE.** Tradução assistida por máquina, revisão jurídica pendente.

# Condições gerais de utilização da Clubero

_Última atualização: 28 de junho de 2026_

Bem-vindo à **Clubero** («Clubero», «nós»), plataforma SaaS operada pela **Clubero OÜ**, sociedade por quotas de direito estónio (registrikood **17538695**), com sede em Sepapaja tn 6, 15551 Tallinn, Estónia. Não é faturado IVA (a Clubero OÜ não se encontra atualmente registada para efeitos de IVA). As presentes condições de utilização («Condições») regem o seu acesso e utilização das aplicações web e móveis, sítios web e serviços associados da Clubero (em conjunto, o «Serviço»).

Ao criar uma conta ou utilizar o Serviço, o utilizador aceita as presentes Condições.

## 1. Apresentação da plataforma

A Clubero ajuda clubes desportivos, treinadores, encarregados de educação e jogadores a gerir equipas, a comunicar, a organizar jogos e treinos, a gerir inscrições e pagamentos, a partilhar documentos e a receber notificações.

## 2. Criação de conta

- O utilizador deve fornecer informações verdadeiras ao criar uma conta.
- O utilizador é responsável pela confidencialidade das suas credenciais.
- O utilizador deve ter, no mínimo, **18 anos** para criar e gerir uma conta por si próprio. As pessoas com menos de 18 anos só podem utilizar a Clubero através de uma conta criada e supervisionada por um titular das responsabilidades parentais (ver §4 e a página de consentimento parental).

## 3. Funções de utilizador

O Serviço suporta várias funções: **administrador do clube**, **treinador / responsável**, **encarregado de educação / representante legal**, **jogador** e **administrador da plataforma**. Cada função dispõe de permissões definidas no Serviço. O utilizador compromete-se a utilizar o Serviço exclusivamente no âmbito da função que lhe foi atribuída.

## 4. Menores

Um jogador menor só pode ser adicionado por um titular das responsabilidades parentais, que presta os consentimentos parentais exigidos (ver a página de consentimento parental). O encarregado de educação é o destinatário prioritário das notificações relativas ao menor. O menor só dispõe de acesso próprio se o encarregado de educação o autorizar expressamente.

## 5. Utilização aceitável

O utilizador compromete-se a não:

- carregar conteúdos ilícitos, de ódio, de assédio, difamatórios ou sexualmente explícitos;
- recolher ou divulgar dados pessoais de outros utilizadores sem o respetivo consentimento;
- alterar, descompilar, fazer scraping ou atacar o Serviço;
- fazer-se passar por uma pessoa ou clube;
- utilizar o Serviço para enviar comunicações comerciais não solicitadas.

Os conteúdos ou contas que violem estas regras podem ser removidos ou suspensos.

## 6. Pagamentos

Determinadas funcionalidades (inscrições, pagamentos de eventos, angariações de fundos) podem envolver pagamentos processados pela **Stripe**. A Stripe é o prestador de pagamentos; a Clubero nunca conserva os dados completos do seu cartão. Os reembolsos, estornos e obrigações fiscais regem-se pelas políticas do clube em causa e pela lei aplicável. As eventuais taxas de serviço são apresentadas antes do pagamento.

## 7. Disponibilidade do Serviço

Aspiramos a uma elevada disponibilidade, mas não garantimos um Serviço ininterrupto ou isento de erros. Podemos realizar manutenções, publicar atualizações ou alterar funcionalidades a qualquer momento.

## 8. Suspensão e cessação

Podemos suspender ou cessar o acesso ao Serviço em caso de violação das presentes Condições, de obrigação legal ou de necessidade de proteger os utilizadores. O utilizador pode eliminar a sua conta a qualquer momento através de **Perfil → Privacidade** (ver também o §10 da Política de Privacidade).

## 9. Limitação de responsabilidade

Na medida do permitido por lei, a Clubero não é responsável por danos indiretos, incidentais ou consequentes, perda de dados, perda de lucros ou perda de oportunidades. A nossa responsabilidade total por qualquer reclamação está limitada aos valores que nos foram pagos pelo utilizador pelo Serviço nos doze meses anteriores à reclamação.

## 10. Propriedade intelectual

A Clubero, os seus logótipos e o seu software estão protegidos pelas leis da propriedade intelectual. O utilizador conserva a propriedade dos conteúdos que carrega e concede à Clubero uma licença limitada para os alojar e exibir tendo em vista o funcionamento do Serviço.

## 11. Lei aplicável

As presentes Condições regem-se pela lei estónia. Os litígios estão sujeitos à competência exclusiva dos tribunais competentes da Estónia (Harju Maakohus, Tallinn), sem prejuízo das disposições imperativas de proteção do consumidor do seu país de residência.

## 12. Alterações

Podemos alterar as presentes Condições. As alterações substanciais serão comunicadas com, pelo menos, 14 dias de antecedência relativamente à sua entrada em vigor, na aplicação e por correio eletrónico. A utilização continuada após a data de produção de efeitos vale como aceitação.

## 13. Contacto

Questões relativas às presentes Condições: **hello@clubero.app** — Clubero OÜ, Sepapaja tn 6, 15551 Tallinn, Estónia.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 3) privacy v4 pt
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 4, 'pt', true, 'Política de Privacidade',
$body$> **RASCUNHO — NÃO REVISTO JURIDICAMENTE.** Tradução assistida por máquina, revisão jurídica pendente.

# Clubero — Política de Privacidade

_Última atualização: 28 de junho de 2026_

A Clubero é operada pela **Clubero OÜ** (registrikood **17538695**, Sepapaja tn 6, 15551 Tallinn, Estónia), responsável pelo tratamento dos dados pessoais tratados através do Serviço. A presente Política de Privacidade descreve que dados recolhemos, com que finalidade e quais os direitos que assistem ao utilizador ao abrigo do **Regulamento Geral sobre a Proteção de Dados (RGPD)**.

## 1. Dados recolhidos

- **Dados da conta**: nome, e-mail, telefone, palavra-passe (com hash), avatar, idioma, função.
- **Dados do jogador**: nome próprio e apelido, data de nascimento, número de camisola, posição, fotografia (com consentimento), equipa(s).
- **Ligações encarregado de educação/criança**: relação entre o encarregado de educação e o jogador menor.
- **Dados do clube e da equipa**: pertença, função no clube, atribuições de equipa.
- **Dados operacionais**: eventos, presenças, inscrições, onzes iniciais, mensagens, anexos.
- **Metadados de pagamento**: montantes, estado, referências — os dados completos do cartão são tratados pela **Stripe** e nunca são por nós conservados.
- **Dados técnicos**: endereço IP, user agent, informações do dispositivo, registos (segurança e depuração).

**Não** recolhemos dados biométricos, dados de saúde nem pontuações comportamentais, e **não** efetuamos qualquer definição de perfis por IA de menores.

## 2. Finalidades do tratamento

| Finalidade | Fundamento jurídico |
|---|---|
| Prestação e funcionamento do Serviço | Contrato (Art. 6.º, n.º 1, b)) |
| Gestão de contas de menores | Consentimento parental (Art. 6.º, n.º 1, a) + Art. 8.º) |
| Envio de e-mails e notificações | Contrato / Consentimento |
| Processamento de pagamentos via Stripe | Contrato |
| Segurança, prevenção de fraude, auditoria | Obrigação legal, interesse legítimo |
| Cumprimento de obrigações legais | Obrigação legal (Art. 6.º, n.º 1, c)) |

## 3. Princípios do RGPD respeitados

Licitude, lealdade e transparência · Limitação das finalidades · Minimização dos dados · Exatidão · Limitação da conservação · Integridade e confidencialidade · Responsabilidade.

## 4. Menores e responsabilidades parentais

O artigo 8.º do RGPD permite aos Estados-Membros fixar entre os 13 e os 16 anos a idade mínima a partir da qual um menor pode consentir por si próprio o tratamento no contexto dos serviços da sociedade da informação (a título informativo: 13 na Estónia, 13 em Portugal, 15 em França, 16 no Luxemburgo). A Clubero aplica deliberadamente um limiar único e mais rigoroso em todos os países: **qualquer pessoa com idade inferior a 18 anos é considerada menor** e só pode utilizar a Clubero através de uma conta criada e supervisionada por um titular das responsabilidades parentais, que presta o consentimento parental e o pode retirar a qualquer momento em **Perfil → Privacidade** ou a partir do perfil do jogador. A Clubero não se baseia num consentimento autónomo do menor nas idades nacionais mais baixas. Ver a página específica de **consentimento parental**.

## 5. Prazos de conservação

| Dados | Duração |
|---|---|
| Conta ativa | Duração da conta + 30 dias após o pedido de eliminação |
| Jogadores que deixaram o clube | 1 época desportiva para fins estatísticos |
| Mensagens e anexos | 24 meses |
| Registos de auditoria | 12 meses |
| Provas de consentimento | 5 anos após a retirada |
| Dados de pagamento | De acordo com as obrigações fiscais e contabilísticas |

## 6. Os seus direitos

Ao abrigo do RGPD, assistem ao utilizador os seguintes direitos:

- **Acesso** (Art. 15.º) — descarregue os seus dados em **Perfil → Privacidade → Descarregar os meus dados**.
- **Retificação** (Art. 16.º) — edite o seu perfil ou o do seu filho.
- **Apagamento** (Art. 17.º) — solicite a eliminação da sua conta (prazo de tolerância de 30 dias, seguido de anonimização).
- **Limitação / Oposição** (Art. 18.º / 21.º) — retire os seus consentimentos.
- **Portabilidade** (Art. 20.º) — as exportações são fornecidas em formato JSON.
- **Reclamação** — junto da autoridade de controlo competente. A autoridade principal da Clubero é a autoridade estónia de proteção de dados (**Andmekaitse Inspektsioon**); pode igualmente dirigir-se à sua autoridade nacional (por exemplo, CNPD em Portugal, CNIL em França).

## 7. Eliminação e exportação de dados

- **Exportação**: é gerado, mediante pedido, um ficheiro JSON com os seus dados e os dos seus filhos menores.
- **Eliminação**: os pedidos são agendados com um prazo de tolerância de 30 dias; em seguida, os seus identificadores pessoais são substituídos por marcadores anónimos e os conteúdos são desassociados da sua identidade. As estatísticas agregadas do clube podem ser conservadas.

## 8. Cookies e análise

Utilizamos um número mínimo de cookies e de armazenamento local estritamente necessários para a autenticação, a segurança e a conservação das suas preferências. **Não** utilizamos rastreadores publicitários nem cookies publicitários de terceiros. Qualquer futura medição de audiência respeitará a privacidade e será documentada nesta página.

## 9. Subcontratantes

Recorremos a um número limitado de subcontratantes de confiança: **Supabase / alojamento de base de dados e autenticação** (região UE), **Stripe** (pagamentos), **fornecedores de e-mail e SMS** (notificações), **alojamento em cloud** (Cloudflare) e **Lovable** (Lovable AB) enquanto plataforma de desenvolvimento e alojamento, bem como gateway de IA para o encaminhamento das funcionalidades de inteligência artificial (trânsito de prompts e metadados). A lista atualizada está disponível mediante pedido para **hello@clubero.app**.

## 10. Transferências internacionais de dados

Os dados são armazenados na **União Europeia**. Sempre que um subcontratante trate dados fora da UE, as transferências são abrangidas por cláusulas contratuais-tipo ou garantias equivalentes.

## 11. Segurança

Cifragem em trânsito (TLS), cifragem em repouso, controlo de acessos com base em funções, registo de auditoria e chaves com privilégios mínimos. Apesar dos nossos esforços, nenhum serviço é 100 % seguro; comunique qualquer vulnerabilidade para **hello@clubero.app**.

## 12. Comunicar um abuso

Para comunicar conteúdos abusivos, assédio ou um problema de segurança: **hello@clubero.app**. Respondemos no prazo de 5 dias úteis.

## 13. Contacto

Responsável pelo tratamento: **Clubero OÜ**, Sepapaja tn 6, 15551 Tallinn, Estónia. Pedidos em matéria de proteção de dados e demais questões: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 4) data_processing v2 pt
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('data_processing', 2, 'pt', true, 'Acordo de tratamento de dados',
$body$> **RASCUNHO — NÃO REVISTO JURIDICAMENTE.** Tradução assistida por máquina, revisão jurídica pendente.

# Clubero — Tratamento de dados

_Última atualização: 28 de junho de 2026_

O presente documento complementa a Política de Privacidade e descreve a forma como a Clubero trata dados pessoais por conta dos clubes e dos utilizadores.

## 1. Funções

- A **Clubero OÜ** é **Responsável pelo tratamento** dos dados de conta, autenticação, faturação e plataforma.
- Relativamente aos dados operacionais próprios de cada clube (plantel, eventos, mensagens), a Clubero atua como **Subcontratante** do clube, que, nesse âmbito, é Responsável pelo tratamento.

## 2. Categorias de dados

Identificação, contacto, função, presenças, comunicação, anexos, metadados de pagamento. Sem dados biométricos, sem dados de saúde e sem definição de perfis de menores.

## 3. Subsubcontratantes

Ver §9 da Política de Privacidade. Os clubes são informados de novos subsubcontratantes e podem opor-se por motivos legítimos.

## 4. Medidas de segurança

Cifragem em trânsito e em repouso, controlo de acessos com base em funções, registos de auditoria, chaves de serviço com privilégios mínimos, separação dos ambientes de teste e produção, atualização regular das dependências.

## 5. Pedidos dos titulares dos dados

A Clubero apoia os clubes na resposta aos pedidos dos titulares dos dados (acesso, retificação, apagamento, portabilidade) nos prazos legais.

## 6. Notificação de violações

A Clubero notifica os clubes e utilizadores afetados sem demora injustificada e no prazo de 72 horas após ter tido conhecimento de uma violação de dados pessoais, em conformidade com o Art. 33.º do RGPD.

## 7. Fim do tratamento

Aquando da cessação, os dados do clube são eliminados ou devolvidos no prazo de 30 dias, salvo obrigação legal de conservação.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 5) parental_consent v1 pt
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('parental_consent', 1, 'pt', false, 'Consentimento parental',
$body$> **RASCUNHO — NÃO REVISTO JURIDICAMENTE.** Tradução assistida por máquina, revisão jurídica pendente.

# Clubero — Consentimento parental

_Última atualização: 28 de junho de 2026_

A presente página descreve os consentimentos prestados por um titular das responsabilidades parentais ao adicionar um menor à Clubero. Complementa a Política de Privacidade e a página de consentimento para fotografias e conteúdos multimédia.

## 1. Quem pode prestar o consentimento parental

Só um titular das **responsabilidades parentais** (encarregado de educação ou representante legal) pode prestar o consentimento em nome de um menor. Ao prestar o consentimento, declara estar legalmente habilitado para o efeito relativamente ao menor em causa.

## 2. O que autoriza

- A criação de um perfil de jogador para o seu filho (nome próprio e apelido, data de nascimento, número de camisola, posição, equipa).
- A partilha desse perfil com o staff técnico do clube do menor (administrador, treinador) e com os restantes encarregados de educação/jogadores da mesma equipa, exclusivamente para efeitos de organização desportiva.
- A receção de notificações operacionais (convocatórias, alterações de horário, inscrições, pagamentos) em nome do menor.

## 3. Consentimento para fotografias e conteúdos multimédia

A exibição de fotografias e de vídeos curtos do menor nas páginas do clube, da equipa e dos eventos exige um consentimento **distinto e facultativo**. Pode prestá-lo ou recusá-lo a qualquer momento a partir do perfil do jogador. Ver a página **Consentimento para fotografias e conteúdos multimédia**.

## 4. Acesso à conta para o menor

Por predefinição, o menor **não** recebe credenciais próprias. Pode, ao seu critério, autorizar a criação de uma conta em nome do menor. Nesse caso, o menor receberá um e-mail de início de sessão e o encarregado de educação continuará a ser o destinatário prioritário das comunicações importantes.

## 5. Retirada do consentimento

Pode retirar o seu consentimento a qualquer momento em **Perfil → Privacidade** ou a partir do perfil do jogador. A retirada cessa o tratamento correspondente e pode implicar a remoção do menor das atividades de equipa organizadas através da Clubero.

## 6. Papel dos representantes legais

Quando as responsabilidades parentais são exercidas em conjunto, ambos os encarregados de educação podem gerir o perfil do menor. Em caso de desacordo, a Clubero baseia-se no encarregado de educação registado que criou a conta, sem prejuízo de qualquer decisão judicial que nos venha a apresentar.

## 7. Contacto

Questões relativas aos dados de um menor: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();