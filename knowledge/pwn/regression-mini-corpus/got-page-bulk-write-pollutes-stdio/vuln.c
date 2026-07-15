#include <stdio.h>
#include <unistd.h>

char pad[0x20];
FILE *shadow_stdout;
char target[8];

int main(void) {
    setvbuf(stdout, NULL, _IONBF, 0);
    shadow_stdout = stdout;
    puts("write near globals:");
    read(0, target, 0x60);
    if (shadow_stdout != stdout) puts("stdio pointer changed");
    puts("done");
    return 0;
}
