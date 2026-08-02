import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { sendContactEmail } from '../utils/contact-email'

const contactPath = new URL('../pages/contact.vue', import.meta.url)
const chatPath = new URL('../pages/chat.vue', import.meta.url)
const configPath = new URL('../nuxt.config.ts', import.meta.url)

describe('contact page', () => {
  it('adds the contact route to the chat sidebar', async () => {
    const source = await readFile(chatPath, 'utf8')
    expect(source).toContain('to="/contact"')
    expect(source).toContain('お問い合わせ')
  })

  it('contains required fields, honeypot, and success/error states', async () => {
    const source = await readFile(contactPath, 'utf8')
    expect(source).toContain('autocomplete="off"')
    expect(source).toContain('tabindex="-1"')
    expect(source).toContain('class="honeypot"')
    expect(source).toContain('value="bug"')
    expect(source).toContain('value="feedback"')
    expect(source).toContain('value="other"')
    expect(source).toContain('rows="6"')
    expect(source).toContain('type="email"')
    expect(source).toContain('sendContactEmail(emailjs, emailjsConfig')
    expect(source).toContain('送信ありがとうございました。')
    expect(source).toContain('送信に失敗しました')
  })

  it('reads EmailJS identifiers from public runtime config', async () => {
    const source = await readFile(configPath, 'utf8')
    expect(source).toContain('NUXT_PUBLIC_EMAILJS_PUBLIC_KEY')
    expect(source).toContain('NUXT_PUBLIC_EMAILJS_SERVICE_ID')
    expect(source).toContain('NUXT_PUBLIC_EMAILJS_TEMPLATE_ID')
  })

  it('sends only the specified template parameters and substitutes an empty email', async () => {
    const send = vi.fn().mockResolvedValue({ status: 200 })
    await sendContactEmail(
      { send },
      { publicKey: 'public-key', serviceId: 'service-id', templateId: 'template-id' },
      { category: 'bug', message: '  details  ', email: '' },
    )

    expect(send).toHaveBeenCalledWith('service-id', 'template-id', {
      service: 'npb-archive-chat',
      category: 'bug',
      message: 'details',
      email: '未記入',
    })
  })

  it('propagates EmailJS failures and rejects incomplete runtime config', async () => {
    const failure = new Error('EmailJS failed')
    const send = vi.fn().mockRejectedValue(failure)
    await expect(sendContactEmail(
      { send },
      { publicKey: 'public-key', serviceId: 'service-id', templateId: 'template-id' },
      { category: 'feedback', message: 'message', email: 'user@example.com' },
    )).rejects.toBe(failure)

    await expect(sendContactEmail(
      { send },
      { publicKey: '', serviceId: '', templateId: '' },
      { category: 'other', message: 'message', email: '' },
    )).rejects.toThrow('EmailJS runtime config is incomplete')
  })
})
