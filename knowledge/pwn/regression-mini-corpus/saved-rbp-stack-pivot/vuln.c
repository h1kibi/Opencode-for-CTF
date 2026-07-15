#include <stdio.h>
#include <unistd.h>

char fake_stack[0x200];

void vuln(void) {
    char buf[0x20];
    read(0, fake_stack, sizeof(fake_stack));
    read(0, buf, 0x40);
}

int main(void) {
    setvbuf(stdout, NULL, _IONBF, 0);
    vuln();
    return 0;
}
