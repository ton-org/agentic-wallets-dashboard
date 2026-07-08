/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

function SubtractSparkleIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 47 44" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
            <path
                d="M16.689 13.6717C17.1128 14.2301 17.886 14.386 18.493 14.0355C19.1001 13.685 19.3516 12.9375 19.0799 12.2913L14.7397 1.9684C14.3466 1.03345 15.0332 -4.14946e-06 16.0474 0L30.6538 5.97584e-05C31.668 6.39078e-05 32.3546 1.0335 31.9615 1.96845L27.6215 12.2913C27.3498 12.9375 27.6013 13.685 28.2084 14.0355C28.8155 14.386 29.5885 14.23 30.0123 13.6716L36.4062 5.24679C37.0194 4.43888 38.2577 4.51675 38.7648 5.39509L45.827 17.6273C46.3341 18.5056 45.7824 19.6169 44.7762 19.744L34.2832 21.0689C33.5877 21.1568 33.0661 21.7483 33.0661 22.4493C33.0661 23.1503 33.5877 23.7418 34.2831 23.8297L44.2254 25.0849C45.2316 25.212 45.7833 26.3233 45.2762 27.2016L38.4291 39.0611C37.922 39.9395 36.6837 40.0173 36.0706 39.2094L30.0124 31.2268C29.5886 30.6684 28.8155 30.5125 28.2084 30.863C27.6013 31.2135 27.3498 31.961 27.6215 32.6072L31.5312 41.9065C31.9243 42.8414 31.2377 43.8749 30.2235 43.8749L16.4778 43.8749C15.4636 43.8749 14.777 42.8414 15.1701 41.9065L19.08 32.6072C19.3517 31.961 19.1001 31.2135 18.4931 30.863C17.886 30.5125 17.1129 30.6684 16.6891 31.2267L10.2147 39.7576C9.60151 40.5654 8.36325 40.4876 7.85614 39.6092L0.742327 27.2878C0.235214 26.4094 0.786922 25.2981 1.79316 25.1711L12.4183 23.8296C13.1138 23.7417 13.6354 23.1502 13.6354 22.4492C13.6354 21.7482 13.1138 21.1567 12.4183 21.0688L1.24228 19.6577C0.236039 19.5307 -0.315667 18.4194 0.191447 17.541L7.52049 4.84679C8.0276 3.96845 9.26588 3.89059 9.87902 4.69849L16.689 13.6717Z"
                fill="currentColor"
            />
        </svg>
    );
}

export function WalletHierarchySVG() {
    return (
        <svg viewBox="0 0 400 248" fill="none" className="mx-auto h-auto w-full max-w-md" aria-hidden="true">
            {/* Master node — central, prominent */}
            <rect x="140" y="24" width="120" height="52" rx="12" stroke="currentColor" strokeWidth="1.5" />
            <text x="200" y="52" textAnchor="middle" fill="currentColor" fontSize="11" fontWeight="600" fontFamily="system-ui">
                Your Wallet
            </text>

            {/* Branching paths — curves not straight lines */}
            <path d="M170 76 C170 120 72 120 72 156" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />
            <path d="M200 76 C200 110 200 130 200 156" stroke="currentColor" strokeWidth="1" strokeOpacity="0.35" />
            <path d="M230 76 C230 120 328 120 328 156" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" />

            {/* Dots along each branch — center accent, sides subtle */}
            <circle r="2" fill="var(--accent-default)" opacity="0.85">
                <animateMotion dur="5s" repeatCount="indefinite" path="M200 76 C200 110 200 130 200 156" />
            </circle>
            <circle r="1.5" fill="currentColor" opacity="0.2">
                <animateMotion dur="5.5s" repeatCount="indefinite" path="M170 76 C170 120 72 120 72 156" begin="0.8s" />
            </circle>
            <circle r="1.5" fill="currentColor" opacity="0.2">
                <animateMotion dur="5.5s" repeatCount="indefinite" path="M230 76 C230 120 328 120 328 156" begin="1.6s" />
            </circle>

            {/* Center wallet — highlighted (OpenClaw) */}
            <rect x="140" y="156" width="120" height="64" rx="12" stroke="currentColor" strokeWidth="1" />
            <text x="200" y="186" textAnchor="middle" fill="currentColor" fontSize="11" fontFamily="system-ui">
                OpenClaw
            </text>
            <text x="200" y="204" textAnchor="middle" fill="currentColor" fontSize="10" fontFamily="monospace" opacity="0.5">
                50 GRAM
            </text>

            {/* Left sub-wallet — dimmer (Claude) */}
            <rect x="12" y="156" width="120" height="64" rx="12" stroke="currentColor" strokeWidth="1" strokeOpacity="0.25" />
            <text x="72" y="186" textAnchor="middle" fill="currentColor" fontSize="11" fontFamily="system-ui" opacity="0.35">
                Claude
            </text>
            <text x="72" y="204" textAnchor="middle" fill="currentColor" fontSize="10" fontFamily="monospace" opacity="0.2">
                120 GRAM
            </text>

            {/* Right sub-wallet — dimmer (ChatGPT) */}
            <rect x="268" y="156" width="120" height="64" rx="12" stroke="currentColor" strokeWidth="1" strokeOpacity="0.25" />
            <text x="328" y="186" textAnchor="middle" fill="currentColor" fontSize="11" fontFamily="system-ui" opacity="0.35">
                ChatGPT
            </text>
            <text x="328" y="204" textAnchor="middle" fill="currentColor" fontSize="10" fontFamily="monospace" opacity="0.2">
                200 GRAM
            </text>

            {/* Withdraw dashed line going back up to master wallet */}
            <path d="M214 150 L214 84" stroke="currentColor" strokeWidth="1" strokeOpacity="0.25" strokeDasharray="3 3" />
            <polygon points="214,80 210,88 218,88" fill="currentColor" fillOpacity="0.25" />
            <text x="222" y="120" fill="currentColor" fontSize="8" fontFamily="system-ui" opacity="0.35">
                Withdraw
            </text>
        </svg>
    );
}

export function LandingHero() {
    return (
        <section className="relative overflow-hidden">
            <div className="mx-auto flex max-w-[1240px] justify-center px-6 pb-12 pt-12 text-center sm:pb-24 sm:pt-20 lg:pt-32">
                <div className="flex max-w-4xl flex-col items-center gap-8">
                    <div>
                        <div>
                            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-5xl">
                                <span className="inline-flex items-baseline gap-1 text-accent">
                                    <span>Agentic Wallets</span>
                                    <SubtractSparkleIcon className="inline-block h-[0.78em] w-auto shrink-0 sm:h-[0.74em] -translate-y-[0.25em]" />
                                </span>{' '}
                                <span className="text-primary">on TON</span>
                            </h1>

                            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-neutral-400 sm:text-xl">
                                Set up isolated self-custodial wallets for AI agents in 5 minutes and let them transact autonomously
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}


