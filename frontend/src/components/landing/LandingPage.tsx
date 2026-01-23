import { SignInButton, SignUpButton } from "@clerk/clerk-react"

export function LandingPage() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat animate-slow-pan"
        style={{
          backgroundImage: "url(/images/pastoral-landscape.jpg)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/50 to-black/75" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="w-full text-center">
          {/* Title */}
          <div className="opacity-0 animate-fade-in-up mb-12">
            <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-9xl text-white whitespace-nowrap text-center mb-[-36px] font-normal tracking-normal">
              GeoCiv
            </h1>
          </div>

          <div className="max-w-lg mx-auto">
            {/* Tagline */}
            <div className="opacity-0 animate-fade-in-up animate-delay-200 mb-12 mt-8">
              <p className="text-white/85 text-base font-light tracking-normal leading-tight">
                A map-first civic simulator. Seven regions, seven representatives, one city. Legislation made tangible.
              </p>
            </div>

            {/* Auth Buttons - Same glassmorphism effect as email form */}
            <div className="opacity-0 animate-fade-in-up animate-delay-400">
              <div className="max-w-sm mx-auto">
                <div className="flex p-1.5 bg-white/12 backdrop-blur-md rounded-full border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.1)] before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none relative gap-2 hover:bg-white/16 hover:border-white/30 hover:shadow-[0_12px_40px_rgba(0,0,0,0.18),0_4px_12px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-500 ease-out hover:scale-[1.02]">
                  {/* Sign In Button */}
                  <SignInButton mode="modal" forceRedirectUrl="/app">
                    <button className="flex-1 text-white/90 hover:text-white rounded-full px-6 py-3 transition-all duration-300 font-medium text-sm hover:bg-white/10 cursor-pointer">
                      Sign In
                    </button>
                  </SignInButton>

                  {/* Get Started (Sign Up) Button - Same effect as submit arrow */}
                  <SignUpButton mode="modal" forceRedirectUrl="/app">
                    <button className="bg-white/95 text-black hover:bg-slate-500/90 hover:text-white rounded-full px-6 py-3 transition-all duration-300 font-medium text-sm shadow-[0_4px_16px_rgba(0,0,0,0.15),0_1px_4px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)] hover:shadow-[0_6px_20px_rgba(71,85,105,0.3),0_2px_8px_rgba(71,85,105,0.2)] relative before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-b before:from-white/20 before:to-transparent before:pointer-events-none hover:before:from-slate-400/20 cursor-pointer">
                      Get Started
                    </button>
                  </SignUpButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
