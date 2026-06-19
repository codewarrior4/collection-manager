<script setup lang="ts">
/**
 * AuthTab — provides auth type selection and credentials input.
 *
 * Supports three auth types:
 *   - none: no authentication
 *   - bearer: JWT bearer token, pre-populated from the active environment's
 *             jwtToken store; shows an expiry badge (green / amber / red)
 *   - basic: username + password fields
 *
 * Requirements: 2.10, 2.11, 5.3, 5.5
 */
import { computed } from 'vue'
import { useEnvironmentsStore } from '@/stores/environments'
import { decodeJwt } from '@/services/jwtDecoder'

// ─── Props / Emits ────────────────────────────────────────────────────────────

interface AuthValue {
  type: 'none' | 'bearer' | 'basic'
  token?: string
  username?: string
  password?: string
}

interface Props {
  modelValue: AuthValue
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: AuthValue]
}>()

// ─── Stores ───────────────────────────────────────────────────────────────────

const environmentsStore = useEnvironmentsStore()

// ─── Auth type options ────────────────────────────────────────────────────────

const AUTH_TYPES: AuthValue['type'][] = ['none', 'bearer', 'basic']

function onTypeChange(event: Event): void {
  const newType = (event.target as HTMLSelectElement).value as AuthValue['type']
  emit('update:modelValue', { ...props.modelValue, type: newType })
}

// ─── Bearer token ─────────────────────────────────────────────────────────────

/**
 * The effective token to display in the token field.
 * Requirement 2.11: pre-populate from the JWT store for the active environment
 * when no token is explicitly set on the auth object.
 */
const effectiveToken = computed<string>(() => {
  if (props.modelValue.token) {
    return props.modelValue.token
  }
  return environmentsStore.activeEnvironment?.jwtToken ?? ''
})

function onTokenChange(event: Event): void {
  const newToken = (event.target as HTMLInputElement).value
  emit('update:modelValue', { ...props.modelValue, token: newToken })
}

// ─── JWT badge ────────────────────────────────────────────────────────────────

/**
 * Decode the effective token to determine badge state.
 * Requirement 5.5: display warning badge when token is within 5 min of expiry.
 */
const jwtInfo = computed(() => {
  const token = effectiveToken.value
  if (!token) return null
  return decodeJwt(token)
})

/** Badge configuration: label + Tailwind colour classes. */
const jwtBadge = computed<{ label: string; classes: string } | null>(() => {
  const info = jwtInfo.value
  if (!info) return null

  if (!info.valid) {
    return {
      label: 'Invalid JWT',
      classes: 'bg-error/15 text-error border border-error/30',
    }
  }

  if (info.isExpired) {
    return {
      label: 'Expired',
      classes: 'bg-error/15 text-error border border-error/30',
    }
  }

  if (info.isExpiringSoon) {
    return {
      label: 'Expiring soon',
      classes: 'bg-warning/15 text-warning border border-warning/30',
    }
  }

  return {
    label: 'Valid',
    classes: 'bg-success/15 text-success border border-success/30',
  }
})

// ─── Basic auth fields ────────────────────────────────────────────────────────

function onUsernameChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', { ...props.modelValue, username: value })
}

function onPasswordChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', { ...props.modelValue, password: value })
}
</script>

<template>
  <div class="p-4 flex flex-col gap-4">

    <!-- ── Auth type selector ────────────────────────────────────────────── -->
    <div class="flex items-center gap-3">
      <label
        for="auth-type-select"
        class="text-xs font-medium text-text-secondary uppercase tracking-wide shrink-0"
      >
        Auth type
      </label>
      <div class="relative">
        <!-- Chevron icon -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-secondary"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
        <select
          id="auth-type-select"
          :value="modelValue.type"
          class="h-8 appearance-none rounded border border-dark-border bg-dark-elevated
                 pl-2 pr-7 text-xs font-mono text-text-primary
                 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                 transition-colors cursor-pointer"
          aria-label="Authentication type"
          @change="onTypeChange"
        >
          <option v-for="type in AUTH_TYPES" :key="type" :value="type">
            {{ type }}
          </option>
        </select>
      </div>
    </div>

    <!-- ── Bearer token fields ────────────────────────────────────────────── -->
    <div
      v-if="modelValue.type === 'bearer'"
      class="flex flex-col gap-2"
      role="group"
      aria-label="Bearer token configuration"
    >
      <!-- Token input row + badge -->
      <div class="flex items-center gap-2">
        <label
          for="auth-bearer-token"
          class="text-xs font-medium text-text-secondary shrink-0 w-20"
        >
          Token
        </label>
        <input
          id="auth-bearer-token"
          type="text"
          :value="effectiveToken"
          placeholder="Paste or type a JWT bearer token"
          class="flex-1 h-8 rounded border border-dark-border bg-dark-elevated px-3
                 text-xs font-mono text-text-primary placeholder:text-dark-muted
                 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                 transition-colors"
          aria-label="Bearer token"
          @input="onTokenChange"
        />

        <!-- JWT badge (req 5.5) -->
        <span
          v-if="jwtBadge"
          class="inline-flex items-center gap-1 shrink-0 rounded px-2 py-0.5 text-xs font-medium"
          :class="jwtBadge.classes"
          role="status"
          :aria-label="`Token status: ${jwtBadge.label}`"
        >
          <!-- Green dot for valid, amber for warning, red for expired/invalid -->
          <span
            class="h-1.5 w-1.5 rounded-full shrink-0"
            :class="{
              'bg-success':  jwtBadge.label === 'Valid',
              'bg-warning':  jwtBadge.label === 'Expiring soon',
              'bg-error':    jwtBadge.label === 'Expired' || jwtBadge.label === 'Invalid JWT',
            }"
            aria-hidden="true"
          />
          {{ jwtBadge.label }}
        </span>
      </div>

      <!-- Expiry timestamp hint (when token is valid and has an expiry) -->
      <p
        v-if="jwtInfo?.valid && jwtInfo.expiresAt"
        class="text-xs text-text-secondary pl-[5.5rem]"
        aria-live="polite"
      >
        Expires: {{ jwtInfo.expiresAt.toLocaleString() }}
      </p>

      <!-- Hint when no active environment has a stored token -->
      <p
        v-else-if="!effectiveToken"
        class="text-xs text-dark-muted pl-[5.5rem]"
      >
        No token stored for the active environment. Enter a token above or set one in the
        Environments panel.
      </p>
    </div>

    <!-- ── Basic auth fields ──────────────────────────────────────────────── -->
    <div
      v-else-if="modelValue.type === 'basic'"
      class="flex flex-col gap-2"
      role="group"
      aria-label="Basic authentication credentials"
    >
      <!-- Username -->
      <div class="flex items-center gap-2">
        <label
          for="auth-basic-username"
          class="text-xs font-medium text-text-secondary shrink-0 w-20"
        >
          Username
        </label>
        <input
          id="auth-basic-username"
          type="text"
          :value="modelValue.username ?? ''"
          placeholder="Username"
          class="flex-1 h-8 rounded border border-dark-border bg-dark-elevated px-3
                 text-xs font-mono text-text-primary placeholder:text-dark-muted
                 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                 transition-colors"
          aria-label="Basic auth username"
          autocomplete="username"
          @input="onUsernameChange"
        />
      </div>

      <!-- Password -->
      <div class="flex items-center gap-2">
        <label
          for="auth-basic-password"
          class="text-xs font-medium text-text-secondary shrink-0 w-20"
        >
          Password
        </label>
        <input
          id="auth-basic-password"
          type="password"
          :value="modelValue.password ?? ''"
          placeholder="Password"
          class="flex-1 h-8 rounded border border-dark-border bg-dark-elevated px-3
                 text-xs font-mono text-text-primary placeholder:text-dark-muted
                 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary
                 transition-colors"
          aria-label="Basic auth password"
          autocomplete="current-password"
          @input="onPasswordChange"
        />
      </div>
    </div>

    <!-- ── None — informational note ─────────────────────────────────────── -->
    <div
      v-else
      class="text-xs text-dark-muted"
      role="note"
      aria-label="No authentication"
    >
      No authentication will be sent with this request.
    </div>

  </div>
</template>
