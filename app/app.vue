<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
useHead({
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap' },
  ],
})
useSeoMeta({
  title: 'SixAgo — Travel Governance',
  description: 'Enterprise Travel Governance untuk approval, uang muka, dan reimbursement.',
  ogTitle: 'SixAgo — Travel Governance Enterprise',
  ogDescription: 'Kelola perjalanan dinas korporat terpusat dengan audit trail & SLA.',
})
</script>
