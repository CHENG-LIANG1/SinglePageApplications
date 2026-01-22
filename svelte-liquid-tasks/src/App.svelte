<script>
  import { onMount } from 'svelte'
  import legacyTemplate from './lib/legacy-template.html?raw'
  import { mountLegacyApp } from './lib/legacy'

  onMount(() => {
    mountLegacyApp()
  })
</script>

<div>{@html legacyTemplate}</div>
