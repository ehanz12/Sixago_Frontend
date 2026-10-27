<template>
  <div class="relative min-h-screen w-full overflow-hidden bg-tertiary flex items-center justify-center px-5 font-sans antialiased">
    <!-- Ilustrasi full-bleed (design-reference 1280x704) -->
    <div
      class="absolute inset-0 bg-cover bg-center bg-[url('/img/bg.jpeg')]"
      aria-hidden="true"
    />
    <!-- Konten digeser ~9vh ke atas mengikuti komposisi desain (lihat PNG mock) -->
    <main class="relative w-full max-w-[384px] pb-[18vh]">
      <slot />
    </main>
  </div>
</template>
