// UNVERIFIED (not compiled). Three-wheeler on Chaos Vehicles. The tuning numbers mirror prototype/js/vehicles.js
// (the playable reference for handling feel) and must be re-tuned in-engine; Chaos has no 3-wheel template, so the
// wheel setup (1 steered front, 2 driven rear, differential off) is configured in the Blueprint child.
#pragma once
#include "CoreMinimal.h"
#include "WheeledVehiclePawn.h"
#include "BLSAutoRickshaw.generated.h"

UCLASS()
class BANGALORELIFESIM_API ABLSAutoRickshaw : public AWheeledVehiclePawn { GENERATED_BODY()
public:
  ABLSAutoRickshaw();
  UPROPERTY(EditAnywhere, Category="BLS|Fuel") float FuelCapacityL = 8.f;
  UPROPERTY(BlueprintReadOnly, Category="BLS|Fuel") float FuelL = 8.f;
  UPROPERTY(BlueprintReadOnly, Category="BLS|Damage") float Damage = 0.f;   // 0..100, reduces power like the prototype
  UFUNCTION(BlueprintCallable) void SetThrottle(float V);
  UFUNCTION(BlueprintCallable) void SetSteering(float V);
  UFUNCTION(BlueprintCallable) void SetBrake(float V);
  UFUNCTION(BlueprintCallable) void SetHandbrake(bool b);
  virtual void Tick(float Dt) override;
};
