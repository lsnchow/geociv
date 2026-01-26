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
          <div className="animate-fade-in-up mb-12">
            <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-9xl text-white whitespace-nowrap text-center mb-[-36px] font-normal tracking-normal">
              GeoCiv
            </h1>
          </div>

          <div className="max-w-lg mx-auto">
            {/* Tagline */}
            <div className="animate-fade-in-up animate-delay-200 mb-12 mt-8">
              <p className="text-white/85 text-base font-light tracking-normal leading-tight">
                A map-first civic simulator. Seven regions, seven representatives, one city. Legislation made tangible.
              </p>
            </div>

            {/* Auth Buttons - Same glassmorphism effect as email form */}
            <div className="animate-fade-in-up animate-delay-400">
              <div className="max-w-sm mx-auto flex items-center gap-3 justify-center">
                <a
                  href="/app"
                  className="w-40 h-12 text-white/90 rounded-full px-6 transition-all duration-300 font-medium text-sm border border-white/25 bg-white/5 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.1)] hover:bg-white/12 hover:border-white/40 hover:shadow-[0_10px_30px_rgba(0,0,0,0.18),0_3px_10px_rgba(0,0,0,0.14)] focus-visible:outline-none focus-visible:ring-0 cursor-pointer flex items-center justify-center"
                >
                  Open App
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
