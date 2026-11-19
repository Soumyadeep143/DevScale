// Build & run:  g++ -std=c++17 -O2 -Wall -Wextra -I../unreal/BangaloreLifeSim/Source/BangaloreLifeSim/Metro test_train_dynamics.cpp -o /tmp/ttd && /tmp/ttd
#include "BLSTrainDynamics.h"
#include <cstdio>
#include <cstdlib>
using namespace BLS;
static int fails = 0, passes = 0;
#define CHECK(c, ...) do { if (!(c)) { ++fails; std::printf("FAIL %s:%d  %s  ", __FILE__, __LINE__, #c); std::printf(__VA_ARGS__); std::printf("\n"); } else ++passes; } while (0)

int main() {
  const TrainParams P; const double dt = 0.02;
  { // acceleration: reaches ~full accel but never exceeds jerk limit; top speed capped at 80 km/h
    TrainState S; DriverInput In; In.Notch = 1.0; double prevA = 0, maxJerk = 0, maxAcc = 0;
    for (int i = 0; i < 60.0 / dt; ++i) { Step(S, P, In, dt, 22.2); maxJerk = std::max(maxJerk, std::fabs(S.Accel - prevA) / dt); prevA = S.Accel; maxAcc = std::max(maxAcc, S.Accel); }
    CHECK(maxJerk <= P.Jerk + 1e-6, "jerk %.3f", maxJerk);
    CHECK(maxAcc > 0.95 * P.MaxAccel && maxAcc <= P.MaxAccel + 1e-9, "max accel %.3f", maxAcc);
    CHECK(S.Vel <= P.MaxSpeed + 0.2 && S.Vel > P.MaxSpeed - 1.0, "top speed %.2f m/s", S.Vel);
  }
  { // service brake from 20 m/s stops, never goes backwards
    TrainState S; S.Vel = 20; DriverInput In; In.Notch = -1; double minV = 1e9;
    for (int i = 0; i < 60.0 / dt && S.Vel > 0; ++i) { Step(S, P, In, dt, 22); minV = std::min(minV, S.Vel); }
    CHECK(S.Vel == 0.0 && minV >= 0.0, "vel %.3f", S.Vel);
    CHECK(S.Pos > 200 && S.Pos < 260, "service braking distance from 72 km/h = %.1f m", S.Pos); // v^2/2a = 200 m + ramp-in
  }
  { // emergency brake latches, stops faster than service
    TrainState a, b; a.Vel = b.Vel = 20; DriverInput eb; eb.EB = true; DriverInput sv; sv.Notch = -1;
    for (int i = 0; i < 40.0 / dt; ++i) { Step(a, P, eb, dt, 22); Step(b, P, sv, dt, 22); }
    CHECK(a.Pos < b.Pos, "EB %.1f m vs service %.1f m", a.Pos, b.Pos);
  }
  { // gradient: uphill slows a coasting train, downhill speeds it up
    TrainState up, dn; up.Vel = dn.Vel = 15; DriverInput u; u.Gradient = 0.03; DriverInput d; d.Gradient = -0.03;
    for (int i = 0; i < 10.0 / dt; ++i) { Step(up, P, u, dt, 22); Step(dn, P, d, dt, 22); }
    CHECK(up.Vel < 15 - 1.0 && dn.Vel > 15 + 1.0, "up %.2f down %.2f", up.Vel, dn.Vel);
  }
  { // reference driver stops within +/-1 m of the platform mark for many approach speeds and distances
    double worst = 0; int n = 0;
    for (double v0 : {8.0, 14.0, 20.0, 22.0}) for (double dist : {260.0, 400.0, 800.0, 1200.0}) {
      TrainState S; S.Vel = v0; const double target = dist; bool ok = true;
      for (int i = 0; i < 400.0 / dt && !(S.Vel == 0.0 && S.Pos > 1); ++i) {
        DriverInput In; In.Notch = StationStopNotch(S, P, target, 22.0); Step(S, P, In, dt, 22.0);
      }
      // brake must never be asked beyond physical limits and train must not stop absurdly early
      const double err = S.Pos - target; worst = std::max(worst, std::fabs(err)); ++n;
      if (std::fabs(err) > 1.0) { ok = false; std::printf("  v0=%.0f dist=%.0f -> stopped %.2f m from mark\n", v0, dist, err); }
      CHECK(ok, "stop accuracy v0=%.0f dist=%.0f err=%.2f", v0, dist, err);
    }
    std::printf("reference driver: %d approaches, worst stop error %.2f m\n", n, worst);
  }
  { // overspeed flag
    TrainState S; S.Vel = 20; DriverInput In; Step(S, P, In, dt, 15.0); CHECK(S.Overspeed, "should flag overspeed");
  }
  std::printf("%d checks passed, %d failed\n", passes, fails);
  return fails ? 1 : 0;
}
