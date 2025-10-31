// =====================================================================
// Stats Component - Queue Status Display
// =====================================================================
// Displays two large cards showing the current queue state:
// - Available: Number of free slots in the library
// - Waiting: Number of people currently in the waiting queue
// This is the main visual indicator on the home page dashboard.

interface StatsProps {
  // Number of available slots (peopleInLibrary is a bit of a misnomer - it's actually free slots)
  peopleInLibrary?: number;
  // Number of people currently waiting in the queue
  peopleInQueue?: number;
}

export default function Stats({ 
  peopleInLibrary = 0, 
  peopleInQueue = 0 
}: StatsProps) {
  return (
    <div className="max-w-6xl mx-auto px-10 md:px-6 py-12 md:py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 justify-center place-items-center pt-20">
        {/* AVAILABLE card */}
        <section className="relative w-[92%] md:w-[85%] lg:w-[80%] rounded-[28px] bg-white/70 backdrop-blur-sm border border-black/5 shadow-sm p-8 md:p-16 text-center flex flex-col items-center justify-center min-h-[35vh]">
          <header>
            <h2 className="uppercase tracking-[0.2em] text-[15px] text-neutral-700">Available</h2>
          </header>
          <div className="mt-6 md:mt-8">
            <p className="font-serif leading-none text-black/90 text-[clamp(64px,16vw,160px)]">{peopleInLibrary}</p>
            <p className="mt-6 text-neutral-600 text-lg md:text-xl">slots free</p>
          </div>
        </section>

        {/* WAITING card */}
        <section className="w-[92%] md:w-[85%] lg:w-[80%] rounded-[28px] bg-white/70 backdrop-blur-sm border border-black/5 shadow-sm p-8 md:p-16 text-center flex flex-col items-center justify-center min-h-[35vh]">
          <header>
            <h2 className="uppercase tracking-[0.2em] text-[15px] text-neutral-700">Waiting</h2>
          </header>
          <div className="mt-6 md:mt-8">
            <p className="font-serif leading-none text-black/90 text-[clamp(64px,16vw,160px)]">{peopleInQueue}</p>
            <p className="mt-6 text-neutral-600 text-lg md:text-xl">{peopleInQueue === 0 ? "no queue" : "in queue"}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
