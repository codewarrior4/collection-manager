<template>
  <div class="flex flex-col h-screen bg-gray-900 text-gray-100">
    <header class="flex items-center px-4 py-2 bg-gray-800 border-b border-gray-700">
      <h1 class="text-lg font-semibold text-white">API Collection Manager</h1>
    </header>
    <main class="flex flex-1 overflow-hidden">
      <aside class="w-64 bg-gray-800 border-r border-gray-700 overflow-y-auto">
        <!-- AppSidebar will be mounted here -->
      </aside>
      <section class="flex-1 overflow-auto p-4">
        <!-- RequestBuilder and ResponseViewer will be mounted here -->
        <p class="text-gray-400">Select a request from the sidebar to get started.</p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
// Root layout — full wiring done in task 16
</script>
