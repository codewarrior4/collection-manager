<script lang="ts">
import { defineComponent, ref, computed, type PropType } from 'vue'

export default defineComponent({
  name: 'JsonTree',

  props: {
    data: {
      type: null as unknown as PropType<unknown>,
      required: true,
    },
    depth: {
      type: Number,
      default: 0,
    },
    label: {
      type: String,
      default: undefined,
    },
  },

  setup(props) {
    // Expanded by default when depth <= 2, collapsed when depth > 2
    const isExpanded = ref(props.depth <= 2)

    const dataType = computed((): string => {
      if (props.data === null) return 'null'
      if (Array.isArray(props.data)) return 'array'
      return typeof props.data
    })

    const isLeaf = computed((): boolean => {
      const t = dataType.value
      return t === 'string' || t === 'number' || t === 'boolean' || t === 'null'
    })

    const isExpandable = computed((): boolean => !isLeaf.value)

    const childEntries = computed((): Array<{ key: string; value: unknown }> => {
      if (dataType.value === 'array') {
        return (props.data as unknown[]).map((v, i) => ({ key: String(i), value: v }))
      }
      if (dataType.value === 'object') {
        return Object.entries(props.data as Record<string, unknown>).map(([k, v]) => ({
          key: k,
          value: v,
        }))
      }
      return []
    })

    const collapsedHint = computed((): string => {
      if (dataType.value === 'array') {
        const len = (props.data as unknown[]).length
        return `[${len} item${len !== 1 ? 's' : ''}]`
      }
      if (dataType.value === 'object') {
        const keys = Object.keys(props.data as object).length
        return `{${keys} key${keys !== 1 ? 's' : ''}}`
      }
      return ''
    })

    const indentPx = computed(() => props.depth * 16)

    function toggleExpand(): void {
      isExpanded.value = !isExpanded.value
    }

    return {
      isExpanded,
      dataType,
      isLeaf,
      isExpandable,
      childEntries,
      collapsedHint,
      indentPx,
      toggleExpand,
    }
  },
})
</script>

<template>
  <div class="font-mono text-sm leading-relaxed">
    <!-- ── Expandable node (object / array) ─────────────────────────────── -->
    <div v-if="isExpandable">
      <div
        class="flex items-center gap-1 cursor-pointer select-none group"
        :style="{ paddingLeft: `${indentPx}px` }"
        @click="toggleExpand"
      >
        <!-- Chevron toggle -->
        <span
          class="flex-shrink-0 w-4 h-4 flex items-center justify-center
                 text-text-secondary group-hover:text-text-primary transition-colors"
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-3 h-3 transition-transform"
            :class="isExpanded ? 'rotate-90' : 'rotate-0'"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </span>

        <!-- Key label (when this node has a parent key) -->
        <span v-if="label !== undefined" class="text-purple-400 mr-1">
          "{{ label }}":
        </span>

        <!-- Opening bracket -->
        <span class="text-text-secondary">
          {{ dataType === 'array' ? '[' : '{' }}
        </span>

        <!-- Collapsed hint -->
        <span
          v-if="!isExpanded"
          class="text-dark-muted text-xs ml-1"
        >
          {{ collapsedHint }}
        </span>

        <!-- Closing bracket when collapsed (inline) -->
        <span v-if="!isExpanded" class="text-text-secondary ml-0.5">
          {{ dataType === 'array' ? ']' : '}' }}
        </span>
      </div>

      <!-- Expanded children -->
      <template v-if="isExpanded">
        <JsonTree
          v-for="entry in childEntries"
          :key="entry.key"
          :data="entry.value"
          :depth="depth + 1"
          :label="dataType === 'object' ? entry.key : undefined"
        />

        <!-- Closing bracket -->
        <div
          class="text-text-secondary"
          :style="{ paddingLeft: `${indentPx}px` }"
        >
          <span class="ml-5">{{ dataType === 'array' ? ']' : '}' }}</span>
        </div>
      </template>
    </div>

    <!-- ── Leaf node ─────────────────────────────────────────────────────── -->
    <div
      v-else
      class="flex items-baseline gap-1 flex-wrap"
      :style="{ paddingLeft: `${indentPx + 20}px` }"
    >
      <!-- Key label -->
      <span v-if="label !== undefined" class="text-purple-400">
        "{{ label }}":
      </span>

      <!-- null -->
      <span v-if="dataType === 'null'" class="text-gray-400 italic">
        null
      </span>

      <!-- boolean -->
      <span
        v-else-if="dataType === 'boolean'"
        class="text-yellow-400"
      >
        {{ String(data) }}
      </span>

      <!-- number -->
      <span
        v-else-if="dataType === 'number'"
        class="text-blue-400"
      >
        {{ data }}
      </span>

      <!-- string -->
      <span
        v-else-if="dataType === 'string'"
        class="text-green-400 break-all"
      >
        "{{ data }}"
      </span>
    </div>
  </div>
</template>
