import { getTranslations } from "next-intl/server";

import { BotanicalBackdrop } from "./(landing)/botanical-backdrop";
import {
  LandingHeader,
  HeroSection,
  StatsSection,
  YogaSection,
  DietSection,
  DailyWellnessSection,
  PersonalizationSection,
  ProgressSection,
  LandingCTA,
  LandingFooter,
} from "./(landing)/landing-sections";
import { readTenantSession } from "@/server/auth/session";

/**
 * The public Adira Wellness interactive landing page.
 *
 * Designed as a digital wellness world inspired by botanical aesthetics, 3D meditation
 * guidance, custom wellness icon system, and scroll-driven storytelling.
 */
export default async function Home() {
  const t = await getTranslations("landing");

  // Read authentic tenant session
  const session = await readTenantSession();

  const destination = session ? "/dashboard" : "/sign-in";
  const ctaText = session ? t("goToDashboard") : t("signIn");

  return (
    <div className="theme-bg-wrapper theme-landing-nature relative flex min-h-dvh flex-col bg-canvas">
      {/* Living Organic Botanical Background */}
      <BotanicalBackdrop />

      {/* Desktop & Mobile Header Navigation */}
      <LandingHeader destination={destination} ctaText={ctaText} />

      <main className="flex-1">
        {/* Full-Screen 3D Hero Section */}
        <HeroSection destination={destination} ctaText={ctaText} />

        {/* Trust & Stats Metrics Section */}
        <StatsSection />

        {/* Yoga & Meditation Asanas Section */}
        <YogaSection />

        {/* Healthy Diet & Nutrition Section */}
        <DietSection />

        {/* Daily Wellness Indicators Section */}
        <DailyWellnessSection />

        {/* Personalization Journey Section */}
        <PersonalizationSection />

        {/* Progress & Adherence Section */}
        <ProgressSection />

        {/* Final CTA Banner */}
        <LandingCTA destination={destination} ctaText={ctaText} />
      </main>

      {/* Landing Footer */}
      <LandingFooter />
    </div>
  );
}
