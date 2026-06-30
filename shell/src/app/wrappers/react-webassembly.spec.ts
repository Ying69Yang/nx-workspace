import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactWebassembly } from './react-webassembly';

describe('ReactWebassembly', () => {
  let component: ReactWebassembly;
  let fixture: ComponentFixture<ReactWebassembly>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReactWebassembly],
    }).compileComponents();

    fixture = TestBed.createComponent(ReactWebassembly);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
