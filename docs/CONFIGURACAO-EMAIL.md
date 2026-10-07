# E-mail de conta

O backend aceita um serviço SMTP com TLS para confirmar endereços e recuperar senhas. Sem `SMTP_HOST` e `MAIL_FROM`, o aplicativo informa que o serviço ainda não está configurado. Nenhum endereço é marcado como confirmado e nenhuma recuperação é simulada.

Configure no ambiente do backend:

| Variável | Valor |
| --- | --- |
| `SMTP_HOST` | Host fornecido pelo serviço de e-mail |
| `SMTP_PORT` | `587` para STARTTLS ou `465` para TLS |
| `SMTP_USER` | Usuário SMTP, quando exigido |
| `SMTP_PASSWORD` | Credencial do provedor, armazenada como segredo |
| `MAIL_FROM` | Remetente autorizado no provedor |
| `PUBLIC_APP_URL` | Origem HTTPS do site, sem credenciais |

Não coloque credenciais no Git ou no chat. Autorize o domínio remetente no provedor e configure os registros de e-mail indicados por ele. Depois de atualizar o ambiente, confirme um endereço de teste em Conta e segurança. Em seguida, saia e exercite Esqueci minha senha. O código expira em 30 minutos, funciona uma única vez e a recuperação encerra as sessões anteriores.

A confirmação ainda precisa ser feita pelo proprietário do endereço. A recuperação só envia para endereços já confirmados. A resposta pública não informa se um endereço existe. Os testes locais utilizam SMTP isolado; a entrega por um provedor externo depende da configuração acima e não foi simulada como entrega real.

Referência da integração: [Nodemailer SMTP](https://nodemailer.com/smtp).
