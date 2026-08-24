"use client";

import { useEffect, useState } from "react";

export function InstallAppButton({ compact = false }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return undefined;
    }

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
      setShowGuide(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => null);
      setInstallPrompt(null);
      return;
    }
    setShowGuide((value) => !value);
  }

  if (installed) {
    return <span className={`installStatus ${compact ? "compact" : ""}`}>앱 설치됨</span>;
  }

  return (
    <div className={`installBox ${compact ? "compact" : ""}`}>
      <button className="btn installBtn" type="button" onClick={installApp}>홈화면에 추가</button>
      {showGuide && (
        <div className="installGuide">
          {isIos() ? (
            <>
              <strong>iPhone/iPad 설치</strong>
              <span>Safari 하단 공유 버튼을 누른 뒤, “홈 화면에 추가”를 선택하세요.</span>
            </>
          ) : (
            <>
              <strong>앱 설치 안내</strong>
              <span>브라우저 메뉴에서 “앱 설치” 또는 “홈 화면에 추가”를 선택하세요.</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function isIos() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
}
