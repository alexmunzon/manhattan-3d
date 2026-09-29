import { Ray, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { SPAWN } from '../config/world';
import { DemoCitySource } from '../world/DemoCitySource';
import { LocalFrame } from '../world/geo';
import { CAR, CarController, type DriveInput } from './CarController';

const DT = 1 / 60;
const NORTH = 0;
const EAST = -Math.PI / 2;
const gas: DriveInput = { throttle: 1, steer: 0, handbrake: false };
const coast: DriveInput = { throttle: 0, steer: 0, handbrake: false };
let city: DemoCitySource;
let wallX: number;

beforeAll(async () => {
  city = new DemoCitySource(new LocalFrame(SPAWN));
  await city.load();
  const hit = city.raycast(new Ray(new Vector3(0, 1, 24), new Vector3(1, 0, 0)), 50);
  if (!hit) throw new Error('expected a wall east of the street');
  wallX = hit.point.x;
});

function carAt(x: number, z: number, yaw: number): CarController {
  const car = new CarController(city);
  expect(car.place(x, z, yaw)).toBe(true);
  return car;
}

function drive(car: CarController, input: DriveInput, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) car.update(DT, input);
}

// Streets on the demo grid run along x = -9..9 (north-south) and z = -9..9 (east-west).
describe('CarController', () => {
  it('accelerates up the street to top speed and stays on the ground', () => {
    const car = carAt(0, 300, NORTH);
    drive(car, gas, 5);
    expect(car.speed).toBeCloseTo(CAR.maxSpeed, 5);
    expect(car.position.z).toBeLessThan(300 - 50);
    expect(car.position.y).toBeCloseTo(0, 3);
    expect(car.onGround).toBe(true);
  });

  it('brakes to a stop, then reverses up to reverse top speed', () => {
    const car = carAt(0, 300, NORTH);
    drive(car, gas, 2);
    drive(car, { ...gas, throttle: -1 }, 1);
    expect(car.speed).toBeLessThanOrEqual(0);
    drive(car, { ...gas, throttle: -1 }, 3);
    expect(car.speed).toBeCloseTo(-CAR.maxReverse, 5);
  });

  it('coasts down and the handbrake stops faster than coasting', () => {
    const coaster = carAt(0, 300, NORTH);
    const braker = carAt(0, 300, NORTH);
    for (const c of [coaster, braker]) drive(c, gas, 2);
    drive(coaster, coast, 0.5);
    drive(braker, { ...coast, handbrake: true }, 0.5);
    expect(braker.speed).toBeLessThan(coaster.speed);
  });

  it('steering right turns toward the east', () => {
    const car = carAt(0, 0, NORTH);
    drive(car, gas, 0.5);
    drive(car, { ...gas, throttle: 0.3, steer: 1 }, 1);
    expect(car.yaw).toBeLessThan(-0.3);
  });

  it('bounces off a building instead of driving through it', () => {
    const car = carAt(0, 24, EAST);
    drive(car, gas, 3);
    expect(car.position.x + CAR.halfLength).toBeLessThanOrEqual(wallX + 0.3);
    expect(car.position.y).toBeCloseTo(0, 3);
  });

  it('refuses to be placed where nothing has loaded', () => {
    const car = new CarController({ heightAt: () => null } as unknown as DemoCitySource);
    expect(car.place(0, 0, 0)).toBe(false);
  });
});
