import { useCallback, useEffect, useState } from 'react'
import { canInstall, isIosDevice, isStandalone, type InstallPromptEvent } from './install'

export type InstallAction = 'accepted' | 'dismissed' | 'unavailable'

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState<boolean>(() =>
    typeof window === 'undefined' ? true : isStandalone(),
  )

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferred(null)
      setStandalone(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const isIos = isIosDevice()

  const prompt = useCallback(async (): Promise<InstallAction> => {
    if (!deferred) return 'unavailable'
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    return choice.outcome
  }, [deferred])

  return {
    visible: canInstall({ standalone, deferred, isIos }),
    needsManualGuide: !standalone && deferred === null && isIos,
    prompt,
  }
}
