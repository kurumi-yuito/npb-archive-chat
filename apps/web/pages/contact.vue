<script setup lang="ts">
import emailjs from '@emailjs/browser'
import { useRuntimeConfig, useSeoMeta } from '#imports'
import { onMounted, ref } from 'vue'
import { sendContactEmail } from '../utils/contact-email'

defineOptions({ name: 'ContactPage' })

const category = ref('')
const message = ref('')
const email = ref('')
const hp = ref('')

const sending = ref(false)
const done = ref(false)
const error = ref('')

const config = useRuntimeConfig()
const publicConfig = config.public as Record<string, unknown>
const emailjsConfig = {
  publicKey: String(publicConfig.emailjsPublicKey ?? ''),
  serviceId: String(publicConfig.emailjsServiceId ?? ''),
  templateId: String(publicConfig.emailjsTemplateId ?? ''),
}

useSeoMeta({
  title: 'お問い合わせ',
  description: 'プロ野球専門AIチャットに関するお問い合わせページです。',
})

onMounted(() => {
  if (emailjsConfig.publicKey) {
    emailjs.init({ publicKey: emailjsConfig.publicKey })
  }
})

async function submitContact() {
  error.value = ''
  if (sending.value || !category.value || !message.value.trim()) {
    return
  }
  if (hp.value) {
    done.value = true
    return
  }
  if (!emailjsConfig.publicKey || !emailjsConfig.serviceId || !emailjsConfig.templateId) {
    error.value = '送信に失敗しました'
    return
  }

  sending.value = true
  try {
    await sendContactEmail(emailjs, emailjsConfig, {
      category: category.value,
      message: message.value,
      email: email.value,
    })
    done.value = true
  } catch {
    error.value = '送信に失敗しました'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <main class="contact-page">
    <section class="contact-card" aria-labelledby="contact-heading">
      <NuxtLink class="back-link" to="/chat">← チャットへ戻る</NuxtLink>
      <h1 id="contact-heading">お問い合わせ</h1>

      <div v-if="done" class="contact-complete" role="status">
        <p>送信ありがとうございました。</p>
        <p>内容を確認のうえ、必要に応じて対応します。</p>
      </div>

      <form v-else class="contact-form" @submit.prevent="submitContact">
        <label class="honeypot" aria-hidden="true">
          ウェブサイト
          <input v-model="hp" type="text" autocomplete="off" tabindex="-1">
        </label>

        <label class="field">
          <span>用件 <strong>（必須）</strong></span>
          <select v-model="category" required>
            <option value="" disabled>選択してください</option>
            <option value="bug">バグ報告</option>
            <option value="feedback">フィードバック</option>
            <option value="other">その他</option>
          </select>
        </label>

        <div v-if="category === 'bug'" class="bug-note">
          <p>バグ報告は、発生した際の具体的な操作（画面遷移の流れ、操作内容など）をご記載いただくと、よりスムーズに対応できます。</p>
          <p>現象についてのヒヤリングのため、可能であれば連絡の取れる手段（Twitterかメールアドレス）を記載いただけると助かります。（任意）</p>
        </div>

        <label class="field">
          <span>内容 <strong>（必須）</strong></span>
          <textarea
            v-model="message"
            rows="6"
            required
            placeholder="ご自由に入力してください"
          />
        </label>

        <label class="field">
          <span>連絡先（返信が必要な場合）</span>
          <input v-model="email" type="email" placeholder="example@example.com">
        </label>

        <p v-if="error" class="error-message" role="alert">{{ error }}</p>

        <button class="submit-button" type="submit" :disabled="sending || !category || !message.trim()">
          {{ sending ? '送信中…' : '送信する' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.contact-page {
  min-height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 3rem 1rem;
  background: #f5f5f7;
  color: #0f172a;
  font-family: Inter, "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, ui-sans-serif, system-ui, sans-serif;
}

.contact-card {
  width: min(100%, 42rem);
  box-sizing: border-box;
  margin: 0 auto;
  padding: 2rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
}

.contact-card h1 {
  margin: 1rem 0 1.5rem;
  font-size: 1.6rem;
}

.back-link {
  color: #4f46e5;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

.contact-form,
.field {
  display: grid;
  gap: 0.5rem;
}

.contact-form {
  gap: 1.25rem;
}

.field > span {
  font-size: 0.88rem;
  font-weight: 700;
}

.field strong {
  color: #dc2626;
  font-size: 0.78rem;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 10px;
  background: #f9fafb;
  color: #0f172a;
  font: inherit;
  font-size: 14px;
}

.field textarea {
  resize: vertical;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: #4f46e5;
  outline: 3px solid rgba(79, 70, 229, 0.14);
}

.honeypot {
  display: none;
}

.bug-note {
  padding: 0.9rem 1rem;
  border-radius: 10px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 0.82rem;
  line-height: 1.7;
}

.bug-note p {
  margin: 0;
}

.bug-note p + p {
  margin-top: 0.7rem;
}

.submit-button {
  padding: 12px 16px;
  border: 0;
  border-radius: 4px;
  background: #4f46e5;
  color: #fff;
  font-weight: bold;
  cursor: pointer;
}

.submit-button:hover:not(:disabled) {
  background: #4338ca;
}

.submit-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.error-message {
  margin: 0;
  color: #dc2626;
  font-weight: 700;
}

.contact-complete {
  padding: 1.5rem;
  border-radius: 10px;
  background: #ecfdf5;
  color: #065f46;
}

.contact-complete p {
  margin: 0;
}

.contact-complete p + p {
  margin-top: 0.5rem;
}

@media (max-width: 640px) {
  .contact-page {
    padding: 1rem 0.75rem;
  }

  .contact-card {
    padding: 1.25rem;
  }
}

@media (prefers-color-scheme: dark) {
  .contact-page {
    background: #0f172a;
    color: #f8fafc;
  }

  .contact-card {
    border-color: #334155;
    background: #1e293b;
  }

  .field input,
  .field select,
  .field textarea {
    border-color: #475569;
    background: #0f172a;
    color: #f8fafc;
  }

  .bug-note {
    background: #312e81;
    color: #e0e7ff;
  }

  .contact-complete {
    background: #064e3b;
    color: #d1fae5;
  }
}
</style>
