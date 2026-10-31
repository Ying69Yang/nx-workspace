import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactChatIA } from './react-chat-ia';

describe('ReactChatIA', () => {
  let component: ReactChatIA;
  let fixture: ComponentFixture<ReactChatIA>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReactChatIA],
    }).compileComponents();

    fixture = TestBed.createComponent(ReactChatIA);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
