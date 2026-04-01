import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { SendEmailCommandInput } from '@aws-sdk/client-sesv2';

let client: SESv2Client | undefined;

export function getSesClient(): SESv2Client {
  if (!client) {
    const region = process.env['AWS_REGION'] ?? 'ap-southeast-2';
    client = new SESv2Client({ region });
  }
  return client;
}

export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  configurationSet?: string;
  headers?: Record<string, string>;
  messageId: string;
  sendingDomain?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<string | undefined> {
  const ses = getSesClient();

  const input: SendEmailCommandInput = {
    FromEmailAddress: params.from,
    Destination: {
      ToAddresses: [params.to],
    },
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: params.html, Charset: 'UTF-8' },
        },
        Headers: Object.entries(params.headers ?? {}).map(([name, value]) => ({
          Name: name,
          Value: value,
        })),
      },
    },
    ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
    ConfigurationSetName: params.configurationSet ?? 'marketing',
  };

  const result = await ses.send(new SendEmailCommand(input));
  return result.MessageId;
}
