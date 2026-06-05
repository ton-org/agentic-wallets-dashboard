/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Layout/visual rhythm matches the landing page: max-w-[1240px] rail (via DashboardLayout),
 * spacing-first separation between steps (no full-width rules), eyebrow + h1/h3 scale,
 * body copy text-base/sm:text-lg text-neutral-400, primary CTAs text-base font-semibold.
 */

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import {
    StepChooseClient,
    StepCreateWallet,
    StepFundWallet,
    StepStartUsing,
    StepManageDashboard,
    AdvancedConfig,
} from './getting-started';

const steps = [
    { number: '01', title: 'Add skills', id: 'choose-client' },
    { number: '02', title: 'Create Wallet', id: 'create-wallet' },
    { number: '03', title: 'Fund Wallet', id: 'fund-wallet' },
    { number: '04', title: 'Start using', id: 'start-using' },
    { number: '05', title: 'Dashboard', id: 'manage-dashboard' },
] as const;

type StepId = (typeof steps)[number]['id'];

type StepperSidebarProps = {
    activeStep: StepId;
    mobileStepperNavRef: RefObject<HTMLElement | null>;
    mobileStepperScrollerRef: RefObject<HTMLDivElement | null>;
    setMobileStepRef: (id: StepId) => (el: HTMLAnchorElement | null) => void;
};

function StepperSidebar({
    activeStep,
    mobileStepperNavRef,
    mobileStepperScrollerRef,
    setMobileStepRef,
}: StepperSidebarProps) {
    return (
        <>
            {/* Desktop vertical stepper */}
            <nav className="sticky top-24 hidden shrink-0 self-start lg:block">
                <div className="flex flex-col gap-1">
                    {steps.map((step, i) => {
                        const isActive = step.id === activeStep;
                        const activeIndex = steps.findIndex((s) => s.id === activeStep);
                        const isCompleted = i < activeIndex;

                        return (
                            <a
                                key={step.id}
                                href={`#${step.id}`}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                                    isActive
                                        ? 'bg-amber-500/5'
                                        : 'hover:bg-white/[0.02]'
                                }`}
                            >
                                <span
                                    className={`flex h-6 w-6 items-center justify-center rounded-md font-mono text-[10px] font-bold transition-colors ${
                                        isActive
                                            ? 'bg-amber-500/15 text-amber-500'
                                            : isCompleted
                                              ? 'bg-amber-500/10 text-amber-500/50'
                                              : 'bg-white/[0.04] text-neutral-600'
                                    }`}
                                >
                                    {step.number}
                                </span>
                                <span
                                    className={`text-sm font-medium transition-colors ${
                                        isActive
                                            ? 'text-white'
                                            : isCompleted
                                              ? 'text-neutral-500'
                                              : 'text-neutral-600'
                                    }`}
                                >
                                    {step.title}
                                </span>
                            </a>
                        );
                    })}
                </div>
            </nav>

            {/* Mobile horizontal progress */}
            <nav
                ref={mobileStepperNavRef}
                style={{ top: 'var(--site-header-height, 73px)' }}
                className="sticky z-40 -mx-6 border-b border-white/[0.06] bg-surface px-6 py-3 lg:hidden"
            >
                <div ref={mobileStepperScrollerRef} className="stepper-no-scrollbar flex gap-1 overflow-x-auto">
                    {steps.map((step, i) => {
                        const isActive = step.id === activeStep;
                        const activeIndex = steps.findIndex((s) => s.id === activeStep);
                        const isCompleted = i < activeIndex;

                        return (
                            <a
                                ref={setMobileStepRef(step.id)}
                                key={step.id}
                                href={`#${step.id}`}
                                className={`flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors ${
                                    isActive
                                        ? 'bg-amber-500/10'
                                        : ''
                                }`}
                            >
                                <span
                                    className={`flex h-5 w-5 items-center justify-center rounded font-mono text-[9px] font-bold ${
                                        isActive
                                            ? 'bg-amber-500/15 text-amber-500'
                                            : isCompleted
                                              ? 'bg-amber-500/10 text-amber-500/50'
                                              : 'bg-white/[0.04] text-neutral-600'
                                    }`}
                                >
                                    {step.number}
                                </span>
                                <span
                                    className={`text-xs font-medium ${
                                        isActive ? 'text-white' : 'text-neutral-600'
                                    }`}
                                >
                                    {step.title}
                                </span>
                            </a>
                        );
                    })}
                </div>
            </nav>
        </>
    );
}

export function GettingStartedPage() {
    const [activeStep, setActiveStep] = useState<StepId>(steps[0].id);
    const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
    const mobileStepperNavRef = useRef<HTMLElement>(null);
    const mobileStepperScrollerRef = useRef<HTMLDivElement>(null);
    const mobileStepRefs = useRef<Map<StepId, HTMLAnchorElement>>(new Map());

    useEffect(() => {
        let frameId = 0;

        const updateActiveStep = () => {
            const headerHeight = Number.parseFloat(
                getComputedStyle(document.documentElement)
                    .getPropertyValue('--site-header-height')
                    .trim(),
            );
            const mobileStepperHeight = mobileStepperNavRef.current?.offsetHeight ?? 0;
            const topOffset = window.innerWidth >= 1024
                ? 140
                : (Number.isFinite(headerHeight) ? headerHeight : 73) + mobileStepperHeight;
            let nextActive: StepId = steps[0].id;

            for (const step of steps) {
                const el = sectionRefs.current.get(step.id);
                if (!el) continue;

                if (el.getBoundingClientRect().top <= topOffset) {
                    nextActive = step.id;
                } else {
                    break;
                }
            }

            const lastStep = steps[steps.length - 1];
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) {
                nextActive = lastStep.id;
            }

            setActiveStep((current) => (current === nextActive ? current : nextActive));
        };

        const scheduleUpdate = () => {
            cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(updateActiveStep);
        };

        scheduleUpdate();
        window.addEventListener('scroll', scheduleUpdate, { passive: true });
        window.addEventListener('resize', scheduleUpdate);

        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener('scroll', scheduleUpdate);
            window.removeEventListener('resize', scheduleUpdate);
        };
    }, []);

    useEffect(() => {
        if (window.innerWidth >= 1024) {
            return;
        }

        const activeItem = mobileStepRefs.current.get(activeStep);
        const scroller = mobileStepperScrollerRef.current;
        if (!activeItem || !scroller) {
            return;
        }

        const nextScrollLeft = activeItem.offsetLeft - (scroller.clientWidth - activeItem.clientWidth) / 2;
        scroller.scrollTo({
            left: Math.max(0, nextScrollLeft),
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'auto'
                : 'smooth',
        });
    }, [activeStep]);

    const setRef = (id: string) => (el: HTMLElement | null) => {
        if (el) {
            sectionRefs.current.set(id, el);
        } else {
            sectionRefs.current.delete(id);
        }
    };

    const setMobileStepRef = (id: StepId) => (el: HTMLAnchorElement | null) => {
        if (el) {
            mobileStepRefs.current.set(id, el);
        } else {
            mobileStepRefs.current.delete(id);
        }
    };

    return (
        <div>
            {/* Page header — typography + rail rhythm aligned with landing sections */}
            <div className="mb-10 sm:mb-12">
                <p className="mb-2 text-xs font-medium uppercase tracking-widest text-amber-500">
                    Getting Started
                </p>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    Set up your first agentic wallet
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-neutral-400 sm:text-lg">
                    Follow these five steps to add TON MCP skills, create a wallet, and start
                    giving your AI agent autonomous access to TON.
                </p>
            </div>

            <div className="items-start gap-12 lg:flex">
                <StepperSidebar
                    activeStep={activeStep}
                    mobileStepperNavRef={mobileStepperNavRef}
                    mobileStepperScrollerRef={mobileStepperScrollerRef}
                    setMobileStepRef={setMobileStepRef}
                />

                {/* Main content */}
                <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-12 sm:gap-20">
                        <section id="choose-client" ref={setRef('choose-client')} className="scroll-mt-28">
                            <StepChooseClient />
                        </section>

                        <section id="create-wallet" ref={setRef('create-wallet')} className="scroll-mt-28">
                            <StepCreateWallet />
                        </section>

                        <section id="fund-wallet" ref={setRef('fund-wallet')} className="scroll-mt-28">
                            <StepFundWallet />
                        </section>

                        <section id="start-using" ref={setRef('start-using')} className="scroll-mt-28">
                            <StepStartUsing />
                        </section>

                        <section id="manage-dashboard" ref={setRef('manage-dashboard')} className="scroll-mt-28">
                            <StepManageDashboard />
                        </section>

                        <section className="pt-12 sm:pt-20">
                            <AdvancedConfig />
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
