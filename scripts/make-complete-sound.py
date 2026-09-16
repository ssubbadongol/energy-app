"""
Generates assets/sounds/complete.wav — the task-completion cue.

The sound is synthesised rather than sourced so it can be retuned in place: run
`python scripts/make-complete-sound.py` after changing anything here.

It is an A major triad struck as a fast arpeggio (A5, C#6, E6), each note a sine
with two quiet harmonics for warmth and a short exponential decay. Two things
matter and are easy to get wrong:

  - The 4ms attack ramp. Starting a sine at full amplitude puts a step in the
    waveform, which is audible as a click before the note.
  - The overall gain. This plays over whatever the user is listening to, at a
    moment they did not ask for a sound, so it sits well under full scale.
"""
import math
import os
import struct
import wave

RATE = 44100
NOTES = [880.00, 1108.73, 1318.51]  # A5, C#6, E6
ONSET = 0.06        # seconds between note starts
DECAY = 0.18        # exponential decay constant, seconds
ATTACK = 0.004      # seconds — long enough to kill the click, short enough to feel struck
LENGTH = 0.60       # total file length, seconds
RELEASE = 0.05      # fade to silence at the end, so the file does not stop mid-wave
PEAK = 0.55         # final normalised peak, well under full scale

HARMONICS = [(1, 1.0), (2, 0.30), (3, 0.12)]


def render():
    samples = [0.0] * int(RATE * LENGTH)

    for index, freq in enumerate(NOTES):
        start = int(index * ONSET * RATE)
        for n in range(start, len(samples)):
            t = (n - start) / RATE
            envelope = math.exp(-t / DECAY)
            if t < ATTACK:
                envelope *= t / ATTACK
            # Only bail out on the decay tail. The attack ramp passes through
            # zero at t=0, so testing it here would end every note before its
            # first sample — which renders a silent file, very convincingly.
            if t > ATTACK and envelope < 1e-4:
                break
            value = sum(
                gain * math.sin(2 * math.pi * freq * mult * t) for mult, gain in HARMONICS
            )
            samples[n] += value * envelope

    # The last note is still ringing when the file ends, and a waveform that
    # stops partway through a cycle is a step — the same click as a hard attack,
    # heard on the way out instead of the way in.
    release = int(RELEASE * RATE)
    for i in range(release):
        samples[len(samples) - release + i] *= 1 - (i / release)

    ceiling = max(abs(s) for s in samples) or 1.0
    return [s / ceiling * PEAK for s in samples]


def main():
    samples = render()
    out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds', 'complete.wav')
    os.makedirs(os.path.dirname(out), exist_ok=True)

    with wave.open(os.path.abspath(out), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(b''.join(struct.pack('<h', int(s * 32767)) for s in samples))

    print(f'wrote {os.path.abspath(out)} ({len(samples)} frames, {LENGTH}s)')


if __name__ == '__main__':
    main()
