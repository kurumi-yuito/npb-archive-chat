<script setup lang="ts">
import { navigateTo } from '#app'

defineOptions({ name: 'IndexRedirectPage' })

await navigateTo('/chat', { replace: true })
</script>
