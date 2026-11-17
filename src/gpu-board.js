import {createGpuCanvas} from 'gpucanvas'

export const el = id => document.getElementById(id)
export const number = new Intl.NumberFormat('en-GB')
export const motion = matchMedia('(prefers-reduced-motion: reduce)')

export function node(tag,className,text) {
  const item = document.createElement(tag)
  if (className) item.className = className
  if (text != null) item.textContent = text
  return item
}

export async function board(host, options = {}) {
  let canvas
  try {
    canvas = await createGpuCanvas(host,options)
  } catch {
    host.replaceChildren()
    canvas = await createGpuCanvas(host,{...options,mode:'dom'})
  }
  el('renderer').textContent = canvas.mode === 'gpu' ? 'GPUCanvas · WebGPU' : 'GPUCanvas · DOM renderer'
  document.fonts.ready.then(()=>canvas.invalidate())
  addEventListener('pagehide',event=>{if (!event.persisted) canvas.destroy()})
  return canvas
}

export function report(error) {
  el('renderer').textContent = 'Canvas unavailable'
  el('surface-error').hidden = false
  console.error(error)
}

export function immersiveControls() {
  const settings = el('settings')
  const toggle = el('settings-toggle')
  const full = el('fullscreen')
  const play = el('play')

  function openSettings(open) {
    if (!open && settings.contains(document.activeElement)) toggle.focus()
    settings.hidden = !open
    toggle.setAttribute('aria-expanded',String(open))
  }

  function fullscreen() {
    const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    action.catch(()=>{full.title='Full screen is unavailable in this browser'})
  }

  toggle.addEventListener('click',()=>openSettings(settings.hidden))
  full.hidden = !document.fullscreenEnabled || parent !== window
  full.addEventListener('click',fullscreen)
  document.addEventListener('keydown',event=>{
    if (event.key==='Escape' && !settings.hidden) {
      openSettings(false)
      return
    }
    if (event.ctrlKey || event.altKey || event.metaKey ||
      event.target instanceof Element && event.target.closest('input, button, select, a, summary, [role="button"]')) return
    if (event.code==='Space') {
      event.preventDefault()
      play.click()
    } else if (event.key.toLowerCase()==='f' && !full.hidden) {
      fullscreen()
    } else if (event.key==='ArrowLeft' && el('previous')) {
      event.preventDefault()
      el('previous').click()
    } else if (event.key==='ArrowRight' && el('next')) {
      event.preventDefault()
      el('next').click()
    }
  })
}
