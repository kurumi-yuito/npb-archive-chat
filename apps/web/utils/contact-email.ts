export type ContactEmailConfig = {
  publicKey: string
  serviceId: string
  templateId: string
}

export type ContactEmailInput = {
  category: string
  message: string
  email: string
}

type EmailJsClient = {
  send: (
    serviceId: string,
    templateId: string,
    parameters: Record<string, unknown>,
  ) => Promise<unknown>
}

export async function sendContactEmail(
  client: EmailJsClient,
  config: ContactEmailConfig,
  input: ContactEmailInput,
): Promise<void> {
  if (!config.publicKey || !config.serviceId || !config.templateId) {
    throw new Error('EmailJS runtime config is incomplete')
  }

  await client.send(config.serviceId, config.templateId, {
    service: 'npb-archive-chat',
    category: input.category,
    message: input.message.trim(),
    email: input.email.trim() || '未記入',
  })
}
