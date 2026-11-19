// UNVERIFIED (not compiled).
#include "BLSAutoRickshaw.h"
#include "ChaosWheeledVehicleMovementComponent.h"

ABLSAutoRickshaw::ABLSAutoRickshaw()
{
  PrimaryActorTick.bCanEverTick = true;
  if (UChaosWheeledVehicleMovementComponent* M = Cast<UChaosWheeledVehicleMovementComponent>(GetVehicleMovementComponent())) {
    M->SetUseAutomaticGears(true);
    M->EngineSetup.MaxRPM = 5000.f; M->EngineSetup.MaxTorque = 90.f;   // ~ 7-8 kW class engine; placeholder numbers
    M->Mass = 480.f;                                                  // kerb + driver, kg (verify)
  }
}
void ABLSAutoRickshaw::SetThrottle(float V) { GetVehicleMovementComponent()->SetThrottleInput(V * (FuelL > 0 ? 1.f : 0.f) * (1.f - FMath::Min(0.5f, Damage / 200.f))); }
void ABLSAutoRickshaw::SetSteering(float V) { GetVehicleMovementComponent()->SetSteeringInput(V); }
void ABLSAutoRickshaw::SetBrake(float V) { GetVehicleMovementComponent()->SetBrakeInput(V); }
void ABLSAutoRickshaw::SetHandbrake(bool b) { GetVehicleMovementComponent()->SetHandbrakeInput(b); }
void ABLSAutoRickshaw::Tick(float Dt)
{
  Super::Tick(Dt);
  const float SpeedMS = GetVehicleMovementComponent()->GetForwardSpeed() / 100.f;
  FuelL = FMath::Max(0.f, FuelL - (FMath::Abs(SpeedMS) * 0.00085f * 8.f + 0.00005f * 60.f) * Dt);
}
